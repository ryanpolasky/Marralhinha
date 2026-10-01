import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Lights } from './Stage';
import { marbleSkin, diceSkin, animateDiceSkin } from './skins';
import Board from './Board';
import { ITEMS } from '../game/catalog';

function Spinner({ children, speed = 0.6, tilt = 0.35 }) {
  const ref = useRef();
  useFrame(({ clock }, dt) => {
    ref.current.rotation.y += dt * speed;
    ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.8) * tilt * 0.3 + tilt;
  });
  return <group ref={ref}>{children}</group>;
}

function MarblePreview({ itemId, seat }) {
  const skin = marbleSkin(itemId, seat);
  useFrame(({ clock }) => skin.animate?.(clock.elapsedTime));
  return (
    <Spinner>
      <mesh material={skin.material}>
        <sphereGeometry args={[1.35, 64, 40]} />
      </mesh>
    </Spinner>
  );
}

function DicePreview({ itemId }) {
  const materials = diceSkin(itemId);
  useFrame(() => animateDiceSkin(materials));
  const geometry = useMemo(() => new RoundedBoxGeometry(1.9, 1.9, 1.9, 6, 0.28), []);
  return (
    <Spinner speed={0.8} tilt={0.6}>
      <mesh geometry={geometry} material={materials} />
    </Spinner>
  );
}

function BoardPreview({ itemId }) {
  return (
    <group scale={0.19} rotation-x={0.75}>
      <Spinner speed={0.3} tilt={0}>
        <Board active={[0, 1, 2, 3]} names={[]} turn={null} skin={itemId} table={false} />
      </Spinner>
    </group>
  );
}

export default function ItemPreview({ itemId, seat = 0 }) {
  const slot = ITEMS[itemId]?.slot;
  return (
    <Canvas dpr={[1, 2]} camera={{ fov: 32, position: [0, 0.4, 6.2] }} gl={{ alpha: true, antialias: true }} resize={{ offsetSize: true }} events={() => ({ enabled: false, priority: 1, handlers: {} })}>
      <Lights shadowSize={512} extent={4} />
      <group key={`${itemId}-${seat}`}>
        {slot === 'marble' && <MarblePreview itemId={itemId} seat={seat} />}
        {slot === 'dice' && <DicePreview itemId={itemId} />}
        {slot === 'board' && <BoardPreview itemId={itemId} />}
      </group>
    </Canvas>
  );
}
