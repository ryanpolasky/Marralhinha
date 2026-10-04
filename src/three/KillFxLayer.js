import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { fx } from './fx';
import { makeBoardClip } from './boardClip';
import Particles from './Particles';
import Shockwaves from './Shockwaves';
import Spectacle from './Spectacle';

// Every kill-effect renderer in one group, aware of the board outline so floor effects don't spill into the void
export default function KillFxLayer({ bus = fx, layout, origin = [0, 0] }) {
  const group = useRef();
  const clip = useMemo(() => makeBoardClip(), []);
  const { halfWidth, halfLength } = layout.spec;
  useEffect(() => {
    clip.uniforms.uHalf.value.set(halfWidth, halfLength);
    clip.uniforms.uOrigin.value.set(origin[0], origin[1]);
  }, [clip, halfWidth, halfLength, origin]);
  useFrame(() => {
    group.current.updateWorldMatrix(true, false);
    clip.uniforms.uBoardInv.value.copy(group.current.matrixWorld).invert();
  });
  return (
    <group ref={group}>
      <Particles bus={bus} />
      <Shockwaves bus={bus} clip={clip} />
      <Spectacle bus={bus} clip={clip} />
    </group>
  );
}
