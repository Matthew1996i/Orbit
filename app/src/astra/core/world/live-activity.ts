import { atGround, distance, type LiveWorld, type WorldActor, type WorldNode } from './live-world.types';

const activityVersion = (node: WorldNode) => `${node.session.mcpTool || ''}:${node.session.skillName || ''}:${node.session.resourceCommand || ''}`;

export const ownedActivities = (world: LiveWorld, actorId: string): WorldNode[] => [...world.nodes.values()].filter((node) => {
  if (!node.model || !node.present || !node.session.alive) return false;
  let parent = node.session.parentSessionId;
  const seen = new Set<string>();
  while (parent && !seen.has(parent)) {
    if (parent === actorId) return true;
    seen.add(parent);
    const ancestor = world.nodes.get(parent);
    if (!ancestor?.model) return false;
    parent = ancestor.session.parentSessionId;
  }
  return false;
});

export const updateDestination = (world: LiveWorld, actor: WorldActor) => {
  const node = world.nodes.get(actor.id)!;
  // Only executions (tools and skills) are work stations. Long-lived resources
  // such as servers stay around the agent but never pull it away from its bench.
  const activities = node.present && node.session.alive ? ownedActivities(world, actor.id)
    .filter((activity) => !activity.session.isResource && !activity.session.isResourceGroup) : [];
  const current = activities.find((activity) => activity.id === actor.activityId);
  const pending = activities.find((activity) => actor.visited.get(activity.id) !== activityVersion(activity));
  // Finish the current walk before visiting another simultaneous activity.
  const selected = current && distance(actor.position, actor.destination) > 0.1 ? current : pending || current;
  const destination = !node.present ? actor.entrance : selected ? atGround(selected.position[0], selected.position[2] + 4) : node.position;
  actor.activityId = selected?.id || null;
  if (distance(actor.destination, destination) > 0.01) {
    actor.destination = [...destination]; actor.route = []; actor.retry = 0;
  }
  if (selected && distance(actor.position, actor.destination) < 0.1) actor.visited.set(selected.id, activityVersion(selected));
  for (const key of actor.visited.keys()) if (!activities.some((activity) => activity.id === key)) actor.visited.delete(key);
};
