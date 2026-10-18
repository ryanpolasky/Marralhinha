import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { onIdle, warmSet } from './ufoWarm';

export default function UfoWarmer({ root }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let stopped = false;
    let cancel = () => {};
    const queue = ['ufo-saucer-set', 'ufo-lab-set', 'ufo-kitchen-set'];
    const next = () => {
      if (stopped || !queue.length) return;
      cancel = onIdle(() => {
        if (stopped) return;
        const source = root.current?.getObjectByName(queue.shift());
        if (!source) return next();
        warmSet(gl, scene, camera, source, () => stopped).catch((error) => {
          console.warn('UFO scene prewarm failed', error);
        }).finally(next);
      });
    };
    next();
    return () => {
      stopped = true;
      cancel();
    };
  }, [gl, scene, camera, root]);
  return null;
}
