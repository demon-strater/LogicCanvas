import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@shared/schema";

type SimNode = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number;
  fy?: number;
};

type SimulationState = {
  nodes: SimNode[];
  edges: { source: number; target: number }[];
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;
const MIN_SPACING_X = 60;
const MIN_SPACING_Y = 40;

export function useForceSimulation(
  nodes: Node[],
  edges: Edge[],
  width: number,
  height: number
) {
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const animationRef = useRef<number | null>(null);
  const stateRef = useRef<SimulationState>({ nodes: [], edges: [] });
  const isRunning = useRef(false);
  const tickCount = useRef(0);

  const initializeSimulation = useCallback(() => {
    const centerX = width / 2;
    const centerY = height / 2;

    const simEdges = edges.map((edge) => ({
      source: edge.sourceId,
      target: edge.targetId,
    }));

    const adjacencyList = new Map<number, number[]>();
    const inDegree = new Map<number, number>();
    
    nodes.forEach((n) => {
      adjacencyList.set(n.id, []);
      inDegree.set(n.id, 0);
    });
    
    simEdges.forEach((e) => {
      adjacencyList.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });

    const levels = new Map<number, number>();
    const visited = new Set<number>();
    const queue: number[] = [];

    nodes.forEach((n) => {
      if ((inDegree.get(n.id) || 0) === 0) {
        queue.push(n.id);
        levels.set(n.id, 0);
      }
    });

    if (queue.length === 0 && nodes.length > 0) {
      queue.push(nodes[0].id);
      levels.set(nodes[0].id, 0);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      
      const currentLevel = levels.get(current) || 0;
      const neighbors = adjacencyList.get(current) || [];
      
      neighbors.forEach((neighbor) => {
        if (!levels.has(neighbor)) {
          levels.set(neighbor, currentLevel + 1);
          queue.push(neighbor);
        }
      });
    }

    nodes.forEach((n) => {
      if (!levels.has(n.id)) {
        levels.set(n.id, 0);
      }
    });

    const nodesByLevel = new Map<number, number[]>();
    nodes.forEach((n) => {
      const level = levels.get(n.id) || 0;
      if (!nodesByLevel.has(level)) {
        nodesByLevel.set(level, []);
      }
      nodesByLevel.get(level)!.push(n.id);
    });

    const levelCount = Math.max(...Array.from(nodesByLevel.keys()), 0) + 1;
    const horizontalSpacing = NODE_WIDTH + MIN_SPACING_X;
    const verticalSpacing = NODE_HEIGHT + MIN_SPACING_Y;
    
    const totalWidth = (levelCount - 1) * horizontalSpacing;
    const startX = centerX - totalWidth / 2;

    const positionMap = new Map<number, { x: number; y: number }>();

    nodesByLevel.forEach((nodeIds, level) => {
      const x = startX + level * horizontalSpacing;
      const totalHeight = (nodeIds.length - 1) * verticalSpacing;
      const startY = centerY - totalHeight / 2;

      nodeIds.forEach((nodeId, index) => {
        positionMap.set(nodeId, {
          x: x,
          y: startY + index * verticalSpacing,
        });
      });
    });

    const newNodes: SimNode[] = nodes.map((node) => {
      const initialPos = positionMap.get(node.id) || { x: centerX, y: centerY };
      
      return {
        id: node.id,
        x: initialPos.x,
        y: initialPos.y,
        vx: 0,
        vy: 0,
      };
    });

    stateRef.current = { nodes: newNodes, edges: simEdges };
    tickCount.current = 0;
    setSimNodes([...newNodes]);
  }, [nodes, edges, width, height]);

  const tick = useCallback(() => {
    const { nodes: simNodes, edges: simEdges } = stateRef.current;
    if (simNodes.length === 0) return;

    tickCount.current++;

    const alpha = Math.max(0.05, 1 - tickCount.current / 200);
    
    const minDistX = NODE_WIDTH + MIN_SPACING_X;
    const minDistY = NODE_HEIGHT + MIN_SPACING_Y;

    for (let iteration = 0; iteration < 3; iteration++) {
      for (let i = 0; i < simNodes.length; i++) {
        const node = simNodes[i];
        if (node.fx !== undefined && node.fy !== undefined) continue;

        for (let j = i + 1; j < simNodes.length; j++) {
          const other = simNodes[j];
          if (other.fx !== undefined && other.fy !== undefined) continue;

          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const absX = Math.abs(dx);
          const absY = Math.abs(dy);

          if (absX < minDistX && absY < minDistY) {
            const overlapX = minDistX - absX;
            const overlapY = minDistY - absY;
            
            const pushStrength = 0.5 * alpha;
            
            if (overlapX < overlapY) {
              const push = overlapX * pushStrength;
              if (dx >= 0) {
                node.x -= push;
                other.x += push;
              } else {
                node.x += push;
                other.x -= push;
              }
            } else {
              const push = overlapY * pushStrength;
              if (dy >= 0) {
                node.y -= push;
                other.y += push;
              } else {
                node.y += push;
                other.y -= push;
              }
            }
          }
        }
      }
    }

    const centerX = width / 2;
    const centerY = height / 2;
    const centerPull = 0.002 * alpha;

    for (const node of simNodes) {
      if (node.fx !== undefined && node.fy !== undefined) continue;
      
      node.x += (centerX - node.x) * centerPull;
      node.y += (centerY - node.y) * centerPull;
    }

    const linkStrength = 0.02 * alpha;
    const idealDistance = (NODE_WIDTH + NODE_HEIGHT) / 2 + 80;

    for (const edge of simEdges) {
      const source = simNodes.find((n) => n.id === edge.source);
      const target = simNodes.find((n) => n.id === edge.target);
      
      if (!source || !target) continue;
      if (source.fx !== undefined && target.fx !== undefined) continue;
      
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      
      const force = (dist - idealDistance) * linkStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      
      if (source.fx === undefined) {
        source.x += fx;
        source.y += fy;
      }
      if (target.fx === undefined) {
        target.x -= fx;
        target.y -= fy;
      }
    }

    const paddingX = NODE_WIDTH / 2 + 30;
    const paddingY = NODE_HEIGHT / 2 + 30;
    
    for (const node of simNodes) {
      if (node.fx !== undefined && node.fy !== undefined) {
        node.x = node.fx;
        node.y = node.fy;
      } else {
        node.x = Math.max(paddingX, Math.min(width - paddingX, node.x));
        node.y = Math.max(paddingY, Math.min(height - paddingY, node.y));
      }
    }

    setSimNodes([...simNodes]);
  }, [width, height]);

  const startSimulation = useCallback(() => {
    if (isRunning.current) return;
    isRunning.current = true;

    const animate = () => {
      if (!isRunning.current) return;
      tick();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();
  }, [tick]);

  const stopSimulation = useCallback(() => {
    isRunning.current = false;
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  const fixNode = useCallback((id: number, x: number, y: number) => {
    const node = stateRef.current.nodes.find((n) => n.id === id);
    if (node) {
      node.fx = x;
      node.fy = y;
      node.x = x;
      node.y = y;
    }
  }, []);

  const releaseNode = useCallback((id: number) => {
    const node = stateRef.current.nodes.find((n) => n.id === id);
    if (node) {
      delete node.fx;
      delete node.fy;
      node.vx = 0;
      node.vy = 0;
    }
    tickCount.current = 0;
  }, []);

  useEffect(() => {
    initializeSimulation();
    startSimulation();
    return () => stopSimulation();
  }, [initializeSimulation, startSimulation, stopSimulation]);

  return {
    simNodes,
    fixNode,
    releaseNode,
  };
}
