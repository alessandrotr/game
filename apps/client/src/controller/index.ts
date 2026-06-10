export { CharacterController } from './CharacterController';
export { FollowCamera } from './FollowCamera';
export { useCharacterController, type ControllerState } from './useCharacterController';
export { useKeyboardControls, type ControlsState } from './useKeyboardControls';
export { defaultControllerConfig, type CharacterControllerConfig } from './config';

// Rapier physics variant (requires a <Physics> provider).
export { PhysicsCharacterController } from './PhysicsCharacterController';
export {
  useRapierCharacterController,
  type PhysicsControllerState,
} from './useRapierCharacterController';
