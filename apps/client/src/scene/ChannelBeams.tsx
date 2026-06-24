import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, DoubleSide, Matrix4, Vector3, type Group, type ShaderMaterial } from 'three';
import { ABILITIES } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getCursorGround } from '../store/cursorState';
import { sampleTransform, INTERP_DELAY_MS } from '../store/snapshotBuffer';
import { sendAimChannel } from '../network/colyseus';
import { abilityMuzzleOffset, resolveEnchant } from '../assets/CharacterFactory';
import { GLSL_NOISE, UV_VERTEX, useUTime } from '../render/shaders/common';

// Scratch vectors for orienting the beam (no per-frame allocation).
const _near = new Vector3();
const _far = new Vector3();
const _dir = new Vector3();
const _wid = new Vector3();
const _nrm = new Vector3();
const _up = new Vector3(0, 1, 0);
const _basis = new Matrix4();

/**
 * The priest's Judgment beam — a sustained ray rendered for any player whose
 * replicated `channelAbility` is set. It's a flat ground strip sized EXACTLY to
 * the ability's damage capsule (length = range, width = beamWidth), so the
 * animation reads as the hit area (see the VFX-size memory). Position follows the
 * caster (predicted for the local player, interpolated for remotes) and the strip
 * rotates to the aim direction (the live cursor locally, the replicated dir for
 * remotes). One additive quad per active beam — cheap, no lights.
 *
 * `ChannelAim` streams the local player's cursor heading to the server while
 * channelling, so the ray tracks the mouse.
 */

// Only the priest's Judgment channels today; its dims fix the beam geometry.
const BEAM = ABILITIES.condemn;
const LENGTH = BEAM.range;
const WIDTH = BEAM.beamWidth ?? 0.6;

const beamFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  ${GLSL_NOISE}
  void main(){
    float along = vUv.y;                     // 0 = scepter end, 1 = far tip
    float cx = abs(vUv.x - 0.5) * 2.0;       // 0 centre → 1 at the edge

    // Flare the core wider right at the muzzle so the ray blooms out of the orb,
    // then tightens to the beam width over the first stretch.
    float muzzle = smoothstep(0.16, 0.0, along);             // 1 at base → 0
    float w = mix(1.0, 1.7, muzzle);
    float spine = smoothstep(w, 0.0, cx);                    // bright core
    float edge  = smoothstep(w, 0.5 * w, cx);               // soft width falloff

    // Energy streaming outward (scepter → target) with a living pulse.
    float flow  = noise(vec2(vUv.x * 5.0, along * 14.0 - uTime * 7.0));
    float pulse = 0.8 + 0.2 * sin(uTime * 12.0);

    // Hot ignition concentrated at the orb (bright, on the centre line).
    float ignite = smoothstep(0.13, 0.0, along) * smoothstep(1.0, 0.0, cx);

    // Melt the contact point into the orb (soft alpha ramp, no hard cut) and
    // soften the far tip; keep the source hotter than the tip.
    float originFade = smoothstep(0.0, 0.03, along);
    float tipFade    = smoothstep(1.0, 0.9, along);
    float falloff    = mix(1.0, 0.72, along);

    float body = spine * (0.5 + 0.6 * flow) * pulse * falloff;
    float v = body + ignite * 1.7;
    float alpha = v * edge * originFade * tipFade;

    vec3 col = mix(uColor, vec3(1.0, 1.0, 0.92), clamp(spine + ignite, 0.0, 1.0));
    gl_FragColor = vec4(col * (1.0 + v * 2.2), alpha);
  }
`;

function BeamFor({ sessionId }: { sessionId: string }) {
  const group = useRef<Group>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const isLocal = useGameStore.getState().sessionId === sessionId;
  // Authored gold by default; recolored to an equipped enchant below.
  const uniforms = useMemo(
    () => ({ uTime: { value: Math.random() * 10 }, uColor: { value: new Color(1.0, 0.78, 0.32) } }),
    [],
  );
  useUTime(matRef);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = useGameStore.getState().players.get(sessionId);
    if (!p || !p.alive || p.channelAbility === '') {
      g.visible = false;
      return;
    }
    g.visible = true;

    // Tint the beam to an equipped enchant (its color recolors the scepter), else
    // keep the authored gold.
    const enchant = resolveEnchant(p.enchantId);
    const u = matRef.current?.uniforms.uColor;
    if (u) u.value.set(enchant ? enchant.color : '#ffc752');

    // Caster position + body yaw (where the scepter is held).
    let x = p.x;
    let z = p.z;
    let yaw = p.rotation;
    if (isLocal) {
      const t = getLocalRenderTransform();
      if (t.active) {
        x = t.x;
        z = t.z;
        yaw = t.rotation;
      }
    } else {
      const s = sampleTransform(sessionId, performance.now() - INTERP_DELAY_MS);
      if (s) {
        x = s.x;
        z = s.z;
        yaw = s.rotation;
      }
    }

    // Aim: the live cursor for the local player (zero-lag), the replicated channel
    // direction for everyone else.
    let dx = p.channelDirX;
    let dz = p.channelDirZ;
    if (isLocal) {
      const cur = getCursorGround();
      const cdx = cur.x - x;
      const cdz = cur.z - z;
      const len = Math.hypot(cdx, cdz);
      if (len > 1e-3) {
        dx = cdx / len;
        dz = cdz / len;
      }
    }

    // Near end at the scepter tip (orb), far end on the ground at full range — so
    // the ray visibly emanates from the weapon and descends to the damage line.
    const off = abilityMuzzleOffset(p.characterClass, p.weaponId);
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    _near.set(
      off ? x + off[0] * cos + off[2] * sin : x,
      off ? off[1] : 0.12,
      off ? z - off[0] * sin + off[2] * cos : z,
    );
    _far.set(x + dx * LENGTH, 0.12, z + dz * LENGTH);

    _dir.subVectors(_far, _near);
    const segLen = _dir.length() || 1;
    _dir.multiplyScalar(1 / segLen);
    _wid.crossVectors(_up, _dir);
    if (_wid.lengthSq() < 1e-6) _wid.set(1, 0, 0);
    else _wid.normalize();
    _nrm.crossVectors(_dir, _wid).normalize();
    _basis.makeBasis(_wid, _nrm, _dir);

    g.position.copy(_near);
    g.quaternion.setFromRotationMatrix(_basis);
    g.scale.set(1, 1, segLen / LENGTH); // stretch the fixed-length quad to reach the far end
  });

  return (
    <group ref={group} visible={false}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, LENGTH / 2]}>
        <planeGeometry args={[WIDTH, LENGTH]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={beamFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

// --- Sanctuary field: a holy ground ring around a player carrying a `field`
// status, sized to the status' radius (its damage area). ----------------------

const fieldFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  ${GLSL_NOISE}
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;                       // 0 centre → 1 at the edge
    float ring = smoothstep(0.08, 0.0, abs(r - 0.93)); // bright rim just inside the radius
    float fill = smoothstep(1.0, 0.0, r) * 0.16;        // faint interior glow
    float swirl = 0.65 + 0.35 * noise(p * 9.0 + uTime * 1.6);
    float v = (ring + fill) * swirl * (1.0 - smoothstep(0.98, 1.04, r));
    vec3 col = mix(vec3(1.0, 0.82, 0.4), vec3(1.0, 0.97, 0.8), ring);
    gl_FragColor = vec4(col * (0.8 + v * 1.6), clamp(v, 0.0, 1.0));
  }
`;

function FieldFor({ sessionId }: { sessionId: string }) {
  const group = useRef<Group>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const isLocal = useGameStore.getState().sessionId === sessionId;
  const uniforms = useMemo(() => ({ uTime: { value: Math.random() * 10 } }), []);
  useUTime(matRef);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const p = useGameStore.getState().players.get(sessionId);
    const field = p?.statuses.find((s) => s.kind === 'field');
    if (!p || !p.alive || !field) {
      g.visible = false;
      return;
    }
    g.visible = true;
    let x = p.x;
    let z = p.z;
    if (isLocal) {
      const t = getLocalRenderTransform();
      if (t.active) {
        x = t.x;
        z = t.z;
      }
    } else {
      const s = sampleTransform(sessionId, performance.now() - INTERP_DELAY_MS);
      if (s) {
        x = s.x;
        z = s.z;
      }
    }
    g.position.set(x, 0.06, z);
    // The disc is a unit radius (plane 2×2); scale it to the field's radius so the
    // ring lands on the actual damage area.
    g.scale.set(field.magnitude, 1, field.magnitude);
  });

  return (
    <group ref={group} visible={false}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={UV_VERTEX}
          fragmentShader={fieldFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/** One field aura per player (each self-hides unless that player has a field). */
export function FieldAuras() {
  const ids = useGameStore((s) => s.playerIds);
  return (
    <>
      {ids.map((id) => (
        <FieldFor key={id} sessionId={id} />
      ))}
    </>
  );
}

/** One beam per player (each self-hides unless that player is channelling). */
export function ChannelBeams() {
  const ids = useGameStore((s) => s.playerIds);
  return (
    <>
      {ids.map((id) => (
        <BeamFor key={id} sessionId={id} />
      ))}
    </>
  );
}

/** While the local player channels, stream the cursor heading so the ray tracks
 *  the mouse (throttled to ~20 Hz). */
export function ChannelAim() {
  const last = useRef(0);
  useFrame(() => {
    const { sessionId, players } = useGameStore.getState();
    const me = sessionId ? players.get(sessionId) : undefined;
    if (!me || me.channelAbility === '') return;
    const now = performance.now();
    if (now - last.current < 50) return;
    last.current = now;
    const t = getLocalRenderTransform();
    const ox = t.active ? t.x : me.x;
    const oz = t.active ? t.z : me.z;
    const cur = getCursorGround();
    const dx = cur.x - ox;
    const dz = cur.z - oz;
    if (Math.hypot(dx, dz) < 1e-3) return;
    sendAimChannel(dx, dz);
  });
  return null;
}
