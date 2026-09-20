import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Group } from 'three';
import { activityPresentation, sessionState, type Presentation } from '../../../core/world/activity';
import { STATION_RADIUS, type LiveWorld, type WorldNode } from '../../../core/world/live-world.types';
import { isKitStation, useKitStation, useStationMaterial, useVillageStation, type StationModel } from './station-models';

const isBeingWorked = (world: LiveWorld, node: WorldNode) => [...world.actors.values()].some((actor) => actor.working && actor.activityId === node.id);

type PieceProps = {
  name: string; node: WorldNode; position?: [number, number, number]; scale?: number;
  animate?: (group: Group, elapsed: number, working: boolean) => void;
};
// Um modelo (base ou adereco) da bancada, com material proprio pro fade.
const PieceBody = ({ model, node, position, scale, animate }: PieceProps & { model: StationModel }) => {
  const material = useStationMaterial(model);
  const group = useRef<Group>(null);
  useFrame(({ clock }) => { material.opacity = node.opacity; if (group.current && animate) animate(group.current, clock.elapsedTime, !!group.current.userData.working); });
  return <group ref={group} position={position} scale={scale}>{model.render(material)}</group>;
};
const KitPiece = (props: PieceProps) => <PieceBody {...props} model={useKitStation(props.name)} />;
const VillagePiece = (props: PieceProps) => <PieceBody {...props} model={useVillageStation(props.name)} />;
// O pacote e decidido pelo nome (fixo por instancia), entao cada componente
// roda sempre o mesmo hook.
const StationPiece = (props: PieceProps) => isKitStation(props.name) ? <KitPiece key={props.name} {...props} /> : <VillagePiece key={props.name} {...props} />;
const BaseModel = ({ name, children }: { name: string; children: (model: StationModel) => ReactElement }) => children((isKitStation(name) ? useKitStation : useVillageStation)(name));

const fit = (presentation: Presentation, height: number, width: number) => Math.min(STATION_RADIUS * 2 / Math.max(width, 0.001), (presentation.kind === 'read' || presentation.kind === 'shell' ? 1.6 : 3.2) / Math.max(height, 0.001));

export const ActivityStation = ({ world, node }: { world: LiveWorld; node: WorldNode }) =>
  <BaseModel name={node.model!}>{(base) => <StationBody world={world} node={node} base={base} />}</BaseModel>;

const StationBody = ({ world, node, base }: { world: LiveWorld; node: WorldNode; base: StationModel }) => {
  const presentation = activityPresentation(node.session);
  const [expanded, setExpanded] = useState(false);
  const label = useRef<HTMLDivElement>(null), root = useRef<Group>(null);
  const scale = fit(presentation, base.height, base.width);
  useEffect(() => { node.opacity = 0; }, [node]);
  useFrame(() => {
    const working = isBeingWorked(world, node);
    if (root.current) root.current.traverse((object) => { object.userData.working = working; });
    if (label.current) { label.current.style.opacity = String(node.opacity); label.current.dataset.working = String(working); }
  });
  const swap = presentation.workingModel;
  return <group ref={root} position={node.position}>
    <group scale={scale} onPointerOver={(event) => { event.stopPropagation(); setExpanded(true); }} onPointerOut={() => setExpanded(false)}>
      {/* Base: alguns tipos trocam de modelo enquanto o agente trabalha (bau fechado -> aberto). */}
      <StationPiece name={node.model!} node={node} animate={swap ? (group, _, working) => { group.visible = !working; } : presentation.effect === 'bubble'
        ? (group, elapsed, working) => { const pulse = working ? 1 + Math.sin(elapsed * 9) * 0.04 : 1; group.scale.set(pulse, 1 + (pulse - 1) * 0.5, pulse); }
        : presentation.effect === 'lever' ? (group, elapsed, working) => { group.rotation.x = working ? Math.sin(elapsed * 4) * 0.35 : 0; } : undefined} />
      {swap && <StationPiece name={swap} node={node} animate={(group, _, working) => { group.visible = working; }} />}
      {presentation.prop && <StationPiece name={presentation.prop} node={node} scale={presentation.kind === 'skill' ? 1 : 0.55}
        position={[0, base.height * (presentation.kind === 'shell' ? 0.2 : 1.05), presentation.kind === 'shell' ? 0.6 : 0]}
        animate={presentation.effect === 'crystal' ? (group, elapsed, working) => {
          // O cristal flutua sempre; girando rapido e brilhando (escala) so em uso.
          group.position.y = base.height * 1.05 + Math.sin(elapsed * (working ? 4 : 1.5)) * (working ? 0.35 : 0.12);
          group.rotation.y = elapsed * (working ? 3 : 0.4);
          const glow = working ? 1 + Math.sin(elapsed * 8) * 0.12 : 1; group.scale.setScalar((presentation.kind === 'skill' ? 1 : 0.55) * glow);
        } : (group, elapsed, working) => { group.position.y = base.height * 0.2 + (working ? -Math.abs(Math.sin(elapsed * 4)) * 0.08 : 0); }} />}
    </group>
    <Html position={[0, base.height * scale + 0.9, 0]} center distanceFactor={22} zIndexRange={[25, 0]}>
      <div ref={label} className="astra-activity" data-retiring={!node.present}>
        <button className="astra-agent-name" onClick={() => setExpanded(!expanded)} onFocus={() => setExpanded(true)}
          aria-expanded={expanded} onPointerDown={(event) => event.stopPropagation()}>
          <span aria-hidden="true">{presentation.icon}</span><div><strong>{node.session.name || presentation.label}</strong><small>{presentation.label}</small></div>
        </button>
        {expanded && <div className="astra-activity-details" role="status">
          <strong>{presentation.icon} {presentation.label}</strong><p>{presentation.detail}</p>
          <small>{node.present ? sessionState(node.session) : 'Atividade encerrada'}</small>
          {node.session.mcpServer && <p>Origem: {node.session.mcpServer}</p>}
        </div>}
      </div>
    </Html>
  </group>;
};
