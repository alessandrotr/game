import { useEffect } from 'react';
import { useGameStore } from '../store/useGameStore';
import { audioEngine } from './engine';

/**
 * Maps app state → the music that should be playing. Mounted once at App root so
 * it survives the JoinScreen→world transition (a component inside JoinScreen
 * would unmount on connect and cut the track). Renders nothing.
 *
 * Today: the menu theme plays on the JoinScreen (and while connecting); music
 * stops on entering the world — silence in-game until game tracks exist
 * (confirmed product decision). Adding town/arena tracks later = extend this one
 * mapping (e.g. by `room`); the engine already crossfades on swap.
 */
export function MusicDirector(): null {
  const connected = useGameStore((s) => s.status === 'connected');

  useEffect(() => {
    if (connected) audioEngine.stopMusic();
    else audioEngine.playMusic('music.join');
  }, [connected]);

  return null;
}
