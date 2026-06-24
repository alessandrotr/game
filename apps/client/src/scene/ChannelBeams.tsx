import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import { AdditiveBlending, Color, DoubleSide, Matrix4, Vector3, type Group, type ShaderMaterial } from 'three';
import { ABILITIES } from '@arena/shared';
import { useGameStore } from '../store/useGameStore';
import { getLocalRenderTransform } from '../store/localPlayer';
import { getCursorGround } from '../store/cursorState';
import { sampleTransform, INTERP_DELAY_MS } from '../store/snapshotBuffer';
import { sendAimChannel } from '../network/colyseus';
import { abilityMuzzleOffset, resolveEnchant } from '../assets/CharacterFactory';
import { getWeaponTip } from '../store/weaponTip';
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

// A Vel'Koz-style disintegration ray: a thin white-hot core line riding inside a
// thick, saturated band of churning enchant-colored energy, skinned with
// crackling filaments and pulses racing toward the target. The color lives in the
// wide body (so it reads strongly); white is confined to the narrow core + muzzle.
const beamFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  ${GLSL_NOISE}
  void main(){
    float along = vUv.y;                   // 0 = scepter end, 1 = far tip
    float cx = abs(vUv.x - 0.5) * 2.0;     // 0 centre → 1 at the edge

    // Dense full-width body that tapers softly at the edges + a thin white-hot core.
    float body = pow(max(0.0, 1.0 - cx), 1.3);
    float core = smoothstep(0.15, 0.0, cx);

    // Vel'Koz signature: several layers of energy STREAMING fast outward (scepter →
    // target), so the ray reads as a torrent of power rather than a static strip.
    float s1 = fbm(vec2(cx * 2.0,        along * 5.0  - uTime * 9.0));
    float s2 = fbm(vec2(cx * 4.0 + 3.7,  along * 10.0 - uTime * 15.0));
    float stream = s1 * 0.6 + s2 * 0.4;
    // Bright energy globs pumping down the beam toward the target.
    float globs = pow(0.5 + 0.5 * sin(along * 7.0 - uTime * 17.0 + stream * 6.2831), 6.0);
    // Crackling plasma skin along the edges.
    float crackle = pow(noise(vec2(along * 24.0 - uTime * 12.0, cx * 6.0)), 5.0) * smoothstep(0.3, 1.0, cx);

    // Emerge softly from the orb (long alpha ramp so the flat quad end never shows
    // — the muzzle glow sits over this); soften the far tip; hotter at the source.
    float originFade = smoothstep(0.0, 0.10, along);
    float tipFade    = smoothstep(1.0, 0.92, along);
    float falloff    = mix(1.0, 0.7, along);

    // Streaming colored-body intensity (full width) + traveling globs + edge crackle.
    float bodyI = (body * (0.45 + 0.95 * stream) + globs * body * 1.2 + crackle * 0.8) * falloff;

    // Saturated enchant color across the whole body; white only at the thin core
    // and the traveling globs' peaks.
    vec3 col  = uColor * (0.8 + bodyI * 2.2);
    col      += vec3(1.0) * core * (0.7 + globs * 0.9) * 1.2;

    float alpha = clamp(bodyI + core * 0.9, 0.0, 1.4) * originFade * tipFade;
    gl_FragColor = vec4(col, alpha);
  }
`;

// A soft, camera-facing glow at the scepter tip — a bright ball of energy the
// beam bursts out of. Round (billboarded), so it hides the flat quad seam at the
// contact and reads as the true source regardless of view angle.
const muzzleFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  void main(){
    vec2 p = vUv - 0.5;
    float r = length(p) * 2.0;
    if (r > 1.0) discard;
    float halo = pow(1.0 - r, 2.2);          // soft colored corona
    float core = pow(1.0 - r, 7.0);          // tight white-hot centre
    float pulse = 0.85 + 0.15 * sin(uTime * 16.0);
    vec3 col = uColor * halo * 2.2 + vec3(1.0) * core * 1.7;
    gl_FragColor = vec4(col * pulse, (halo * 0.85 + core) * pulse);
  }
`;

function BeamFor({ sessionId }: { sessionId: string }) {
  const group = useRef<Group>(null);
  const matRef = useRef<ShaderMaterial>(null);
  const muzzle = useRef<Group>(null);
  const muzzleMat = useRef<ShaderMaterial>(null);
  const isLocal = useGameStore.getState().sessionId === sessionId;
  // Authored gold by default; recolored to an equipped enchant below.
  const seed = useMemo(() => Math.random() * 10, []);
  const uniforms = useMemo(
    () => ({ uTime: { value: seed }, uColor: { value: new Color(1.0, 0.78, 0.32) } }),
    [seed],
  );
  const muzzleUniforms = useMemo(
    () => ({ uTime: { value: seed }, uColor: { value: new Color(1.0, 0.78, 0.32) } }),
    [seed],
  );
  useUTime(matRef);
  useUTime(muzzleMat);

  useFrame(() => {
    const g = group.current;
    const mz = muzzle.current;
    if (!g) return;
    const p = useGameStore.getState().players.get(sessionId);
    if (!p || !p.alive || p.channelAbility === '') {
      g.visible = false;
      if (mz) mz.visible = false;
      return;
    }
    g.visible = true;
    if (mz) mz.visible = true;

    // Tint the beam + muzzle to an equipped enchant (recolors the scepter), else
    // keep the authored gold.
    const enchant = resolveEnchant(p.enchantId);
    const color = enchant ? enchant.color : '#ffc752';
    matRef.current?.uniforms.uColor?.value.set(color);
    muzzleMat.current?.uniforms.uColor?.value.set(color);

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

    // Near end exactly at the scepter tip. Prefer the orb's live rendered position
    // (published by the weapon animator — includes the cast swing/pitch, so the ray
    // comes out of the actual orb from any angle); fall back to the rest-pose offset.
    const tipPos = getWeaponTip(sessionId, performance.now());
    if (tipPos) {
      _near.set(tipPos.x, tipPos.y, tipPos.z);
    } else {
      const off = abilityMuzzleOffset(p.characterClass, p.weaponId);
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      _near.set(
        off ? x + off[0] * cos + off[2] * sin : x,
        off ? off[1] : 0.12,
        off ? z - off[0] * sin + off[2] * cos : z,
      );
    }
    // Far end on the ground at full range — the ray descends to the damage line.
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

    // The muzzle glow sits at the orb (camera-facing child), hiding the contact seam.
    if (mz) mz.position.copy(_near);
  });

  return (
    <>
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
      {/* Camera-facing energy ball at the scepter tip — the beam bursts from it. */}
      <group ref={muzzle} visible={false}>
        <Billboard>
          <mesh>
            <planeGeometry args={[WIDTH * 2.2, WIDTH * 2.2]} />
            <shaderMaterial
              ref={muzzleMat}
              vertexShader={UV_VERTEX}
              fragmentShader={muzzleFrag}
              uniforms={muzzleUniforms}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
            />
          </mesh>
        </Billboard>
      </group>
    </>
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
