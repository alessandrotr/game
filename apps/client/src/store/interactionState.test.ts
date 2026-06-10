import { beforeEach, describe, expect, it } from 'vitest';
import { useInteractionStore } from './interactionState';
import { getDialogue } from '../assets/data/dialogues';

const reset = () =>
  useInteractionStore.setState({ nearbyNpcId: null, nearbyNpcName: null, dialogue: null });

describe('useInteractionStore', () => {
  beforeEach(reset);

  it('setNearby only changes on a different id', () => {
    const s = useInteractionStore.getState();
    s.setNearby('npc.a', 'Guard');
    expect(useInteractionStore.getState().nearbyNpcId).toBe('npc.a');
    expect(useInteractionStore.getState().nearbyNpcName).toBe('Guard');
    s.setNearby(null);
    expect(useInteractionStore.getState().nearbyNpcId).toBeNull();
    expect(useInteractionStore.getState().nearbyNpcName).toBeNull();
  });

  it('advances through lines then ends on the last', () => {
    const id = 'dialogue.guard';
    const lineCount = getDialogue(id).lines.length;
    useInteractionStore.getState().open('npc.a', 'Town Guard', id);
    expect(useInteractionStore.getState().dialogue?.line).toBe(0);

    for (let i = 1; i < lineCount; i++) {
      useInteractionStore.getState().advance();
      expect(useInteractionStore.getState().dialogue?.line).toBe(i);
    }
    // Advancing past the last line closes the conversation.
    useInteractionStore.getState().advance();
    expect(useInteractionStore.getState().dialogue).toBeNull();
  });

  it('close ends the conversation immediately', () => {
    useInteractionStore.getState().open('npc.a', 'Town Guard', 'dialogue.guard');
    useInteractionStore.getState().close();
    expect(useInteractionStore.getState().dialogue).toBeNull();
  });
});
