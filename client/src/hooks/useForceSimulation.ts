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

  const initializeSimulation = useCallback(() => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const newNodes: SimNode[] = nodes.map((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(nodes.length, 1);
      return {
        id: node.id,
        x: node.x !== 0 ? node.x : centerX + radius * Math.cos(angle) + (Math.random() - 0.5) * 50,
        y: node.y !== 0 ? node.y : centerY + radius * Math.sin(angle) + (Math.random() - 0.5) * 50,
        vx: 0,
        vy: 0,
      };
    });

    const newEdges = edges.map((edge) => ({
      source: edge.sourceId,
      target: edge.targetId,
    }));

    stateRef.current = { nodes: newNodes, edges: newEdges };
    setSimNodes([...newNodes]);
  }, [nodes, edges, width, height]);

  const tick = useCallback(() => {
    const { nodes: simNodes, edges: simEdges } = stateRef.current;
    if (simNodes.length === 0) return;

    const repulsionStrength = 3000;
    const attractionStrength = 0.008;
    const linkStrength = 0.12;
    const idealLinkDistance = 180;
    const damping = 0.85;
    const centerPull = 0.002;

    const centerX = width / 2;
    const centerY = height / 2;

    for (let i = 0; i < simNodes.length; i++) {
      const node = simNodes[i];
      if (node.fx !== undefined && node.fy !== undefined) continue;

      let fx = 0;
      let fy = 0;

      for (let j = 0; j < simNodes.length; j++) {
        if (i === j) continue;
        const other = simNodes[j];
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsionStrength / (dist * dist);
        fx += (dx / dist) * force;
        fy += (dy / dist) * force;
      }

      fx += (centerX - node.x) * centerPull;
      fy += (centerY - node.y) * centerPull;

      for (const edge of simEdges) {
        let other: SimNode | undefined;
        if (edge.source === node.id) {
          other = simNodes.find((n) => n.id === edge.target);
        } else if (edge.target === node.id) {
          other = simNodes.find((n) => n.id === edge.source);
        }

        if (other) {
          const dx = other.x - node.x;
          const dy = other.y - node.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const displacement = dist - idealLinkDistance;
          const force = displacement * linkStrength;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        }
      }

      node.vx = (node.vx + fx * attractionStrength) * damping;
      node.vy = (node.vy + fy * attractionStrength) * damping;
    }

    for (const node of simNodes) {
      if (node.fx !== undefined && node.fy !== undefined) {
        node.x = node.fx;
        node.y = node.fy;
      } else {
        node.x += node.vx;
        node.y += node.vy;
        const padding = 80;
        node.x = Math.max(padding, Math.min(width - padding, node.x));
        node.y = Math.max(padding, Math.min(height - padding, node.y));
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
    }
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
