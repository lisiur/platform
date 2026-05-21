"use client";

import {
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/utils/cn";

export interface DraggableTreeNode {
  id: string;
  parentId: string | null;
  sortOrder: number;
  name: string;
  icon?: ReactNode;
  children: DraggableTreeNode[];
  [key: string]: unknown;
}

export interface ReorderChange {
  id: string;
  parentId: string | null;
  sortOrder: number;
}

// --- Tree utilities ---

function flattenTree<T extends DraggableTreeNode>(
  nodes: T[],
  expandedIds: Set<string>,
): T[] {
  const result: T[] = [];
  function walk(items: T[]) {
    for (const item of items) {
      result.push(item);
      if (item.children.length > 0 && expandedIds.has(item.id)) {
        walk(item.children as T[]);
      }
    }
  }
  walk(nodes);
  return result;
}

function collectDescendantIds(nodes: DraggableTreeNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    ids.add(node.id);
    for (const id of collectDescendantIds(node.children)) {
      ids.add(id);
    }
  }
  return ids;
}

function buildExpandedDescendantExclusion<T extends DraggableTreeNode>(
  nodes: T[],
  expandedIds: Set<string>,
): Set<string> {
  const excluded = new Set<string>();
  for (const node of nodes) {
    if (expandedIds.has(node.id)) {
      for (const id of collectDescendantIds(node.children)) {
        excluded.add(id);
      }
    }
  }
  return excluded;
}

function sortTree<T extends DraggableTreeNode>(nodes: T[]): void {
  nodes.sort((a, b) => a.sortOrder - b.sortOrder);
  for (const node of nodes) {
    sortTree(node.children as T[]);
  }
}

function findParentId<T extends DraggableTreeNode>(
  nodeId: string,
  nodes: T[],
  parentId: string | null = null,
): string | null {
  for (const node of nodes) {
    if (node.id === nodeId) return parentId;
    const found = findParentId(nodeId, node.children as T[], node.id);
    if (found !== null) return found;
  }
  return null;
}

function collectAllIds(nodes: DraggableTreeNode[]): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.add(node.id);
      for (const id of collectAllIds(node.children)) {
        ids.add(id);
      }
    }
  }
  return ids;
}

// --- Sortable node ---

interface SortableNodeProps<T extends DraggableTreeNode> {
  node: T;
  level: number;
  selectedId?: string | null;
  onSelect?: (node: T) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  renderNode?: (
    node: T,
    props: {
      isDragging: boolean;
      isSelected: boolean;
      isExpanded: boolean;
      hasChildren: boolean;
      level: number;
      attributes: DraggableAttributes;
      listeners: DraggableSyntheticListeners | undefined;
    },
  ) => ReactNode;
}

function SortableNode<T extends DraggableTreeNode>({
  node,
  level,
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
  renderNode,
}: SortableNodeProps<T>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  if (renderNode) {
    return (
      <div ref={setNodeRef} style={style}>
        {renderNode(node, {
          isDragging,
          isSelected,
          isExpanded,
          hasChildren,
          level,
          attributes,
          listeners,
        })}
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
          isSelected && "bg-accent font-medium text-accent-foreground",
          isDragging && "opacity-50",
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        <span
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" />
        </span>
        {node.icon && <span className="shrink-0">{node.icon}</span>}
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onSelect?.(node)}
        >
          {node.name}
        </button>
        <button
          type="button"
          className="flex shrink-0 items-center"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
            onSelect?.(node);
          }}
        >
          {hasChildren ? (
            <>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  !isExpanded && "hidden",
                )}
              />
              <ChevronRight
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  isExpanded && "hidden",
                )}
              />
            </>
          ) : (
            <span className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

// --- DraggableTree ---

export interface DraggableTreeProps<T extends DraggableTreeNode> {
  data: T[];
  selectedId?: string | null;
  onSelect?: (node: T) => void;
  onReorder?: (changes: ReorderChange[]) => void;
  className?: string;
  renderNode?: (
    node: T,
    props: {
      isDragging: boolean;
      isSelected: boolean;
      isExpanded: boolean;
      hasChildren: boolean;
      level: number;
      attributes: DraggableAttributes;
      listeners: DraggableSyntheticListeners | undefined;
    },
  ) => ReactNode;
  renderOverlay?: (node: T) => ReactNode;
  defaultExpandedIds?: string[];
  expandAllLabel?: string;
  collapseAllLabel?: string;
  emptyLabel?: string;
  toolbar?: ReactNode;
}

export function DraggableTree<T extends DraggableTreeNode>({
  data,
  selectedId,
  onSelect,
  onReorder,
  className,
  renderNode,
  renderOverlay,
  defaultExpandedIds = [],
  expandAllLabel = "Expand All",
  collapseAllLabel = "Collapse All",
  emptyLabel = "No data",
  toolbar,
}: DraggableTreeProps<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(defaultExpandedIds),
  );

  const dataRef = useRef<T[]>(data);
  dataRef.current = data;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const treeData = useMemo(() => {
    const sorted = [...data] as T[];
    sortTree(sorted);
    return sorted;
  }, [data]);

  const flatItems = useMemo(
    () => flattenTree(treeData, expandedIds),
    [treeData, expandedIds],
  );

  const expandedDescendantExclusion = useMemo(
    () => buildExpandedDescendantExclusion(treeData, expandedIds),
    [treeData, expandedIds],
  );

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const activeId = String(args.active.id);
      const activeParent = findParentId(activeId, treeData);
      const filtered = args.droppableContainers.filter((c) => {
        const id = String(c.id);
        if (expandedDescendantExclusion.has(id)) return false;
        return findParentId(id, treeData) === activeParent;
      });
      return closestCenter({ ...args, droppableContainers: filtered });
    },
    [expandedDescendantExclusion, treeData],
  );

  const nodeLevels = useMemo(() => {
    const levels = new Map<string, number>();
    function collect(nodes: T[], level: number) {
      for (const node of nodes) {
        levels.set(node.id, level);
        collect(node.children as T[], level + 1);
      }
    }
    collect(treeData, 0);
    return levels;
  }, [treeData]);

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(collectAllIds(treeData));
  }, [treeData]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) return;

      const draggedId = String(active.id);
      const overId = String(over.id);

      const latestData = dataRef.current;
      const overNode = latestData.find((n) => n.id === overId);
      if (!overNode) return;

      const activeParentId = findParentId(draggedId, treeData);
      const overParentId = findParentId(overId, treeData);
      const targetParentId = overParentId ?? overNode.parentId ?? null;

      if (activeParentId !== targetParentId) return;

      const changed: ReorderChange[] = [];

      const siblings = latestData.filter(
        (n) => (n.parentId ?? null) === activeParentId,
      );
      const activeIndex = siblings.findIndex((n) => n.id === draggedId);
      const overIndex = siblings.findIndex((n) => n.id === overId);

      if (activeIndex === -1 || overIndex === -1) return;

      const reordered = arrayMove(siblings, activeIndex, overIndex);

      for (let i = 0; i < reordered.length; i++) {
        const original = latestData.find((n) => n.id === reordered[i].id);
        if (original && original.sortOrder !== i) {
          changed.push({
            id: reordered[i].id,
            parentId: activeParentId,
            sortOrder: i,
          });
        }
      }

      if (changed.length > 0) {
        onReorder?.(changed);
      }
    },
    [treeData, onReorder],
  );

  const activeNode = activeId
    ? (flatItems.find((n) => n.id === activeId) as T | undefined)
    : null;

  const levelMap = useMemo(() => {
    const m = new Map<string, number>();
    function walk(nodes: T[], level: number) {
      for (const node of nodes) {
        m.set(node.id, level);
        walk(node.children as T[], level + 1);
      }
    }
    walk(treeData, 0);
    return m;
  }, [treeData]);

  return (
    <div className={cn("rounded-md border p-1", className)}>
      <div className="flex items-center gap-1 px-1 pb-1">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={expandAll}
        >
          {expandAllLabel}
        </button>
        <span className="text-muted-foreground">/</span>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={collapseAll}
        >
          {collapseAllLabel}
        </button>
        {toolbar}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {flatItems.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <SortableContext
            items={flatItems.map((n) => n.id)}
            strategy={verticalListSortingStrategy}
          >
            {flatItems.map((node) => (
              <SortableNode
                key={node.id}
                node={node as T}
                level={nodeLevels.get(node.id) ?? 0}
                selectedId={selectedId}
                onSelect={onSelect}
                expandedIds={expandedIds}
                onToggle={handleToggle}
                renderNode={renderNode}
              />
            ))}
          </SortableContext>
        )}
        <DragOverlay>
          {activeNode
            ? renderOverlay
              ? renderOverlay(activeNode)
              : (
                <div
                  className="flex items-center gap-1.5 rounded-md bg-background px-2 py-1.5 text-sm shadow-md"
                  style={{ paddingLeft: `${(levelMap.get(activeNode.id) ?? 0) * 16 + 8}px` }}
                >
                  <span className="shrink-0 text-muted-foreground">
                    <GripVertical className="h-4 w-4" />
                  </span>
                  {activeNode.icon && (
                    <span className="shrink-0">{activeNode.icon}</span>
                  )}
                  <span className="truncate">{activeNode.name}</span>
                </div>
              )
            : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
