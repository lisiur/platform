"use client";

import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
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

function collectVisibleDescendants<T extends DraggableTreeNode>(
  node: T,
  expandedIds: Set<string>,
): T[] {
  const result: T[] = [];
  function walk(items: T[]) {
    for (const child of items) {
      result.push(child);
      if (child.children.length > 0 && expandedIds.has(child.id)) {
        walk(child.children as T[]);
      }
    }
  }
  if (expandedIds.has(node.id)) {
    walk(node.children as T[]);
  }
  return result;
}

function findNodeById<T extends DraggableTreeNode>(
  id: string,
  nodes: T[],
): T | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(id, node.children as T[]);
    if (found) return found;
  }
  return undefined;
}

// --- Sortable node ---

interface SortableNodeProps<T extends DraggableTreeNode> {
  node: T;
  level: number;
  selectedId?: string | null;
  onSelect?: (node: T) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  isChildOfDragging?: boolean;
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
  isChildOfDragging,
  renderNode,
  children,
}: SortableNodeProps<T> & { children?: ReactNode }) {
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

  return (
    <div ref={setNodeRef} style={style}>
      {renderNode ? (
        <div className={cn(isChildOfDragging && "invisible")}>
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
      ) : (
        <div
          className={cn(
            "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
            isSelected && "bg-accent font-medium text-accent-foreground",
            isDragging && "opacity-50",
            isChildOfDragging && "invisible",
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </button>
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
      )}
      {children}
    </div>
  );
}

// --- Tree level (one SortableContext per level) ---

interface TreeLevelProps<T extends DraggableTreeNode> {
  nodes: T[];
  level: number;
  selectedId?: string | null;
  onSelect?: (node: T) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  activeDescendantIds: Set<string>;
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

function TreeLevel<T extends DraggableTreeNode>({
  nodes,
  level,
  selectedId,
  onSelect,
  expandedIds,
  onToggle,
  activeDescendantIds,
  renderNode,
}: TreeLevelProps<T>) {
  const items = useMemo(() => nodes.map((n) => n.id), [nodes]);

  return (
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      {nodes.map((node) => (
        <SortableNode
          key={node.id}
          node={node as T}
          level={level}
          selectedId={selectedId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          onToggle={onToggle}
          isChildOfDragging={activeDescendantIds.has(node.id)}
          renderNode={renderNode}
        >
          {expandedIds.has(node.id) && node.children.length > 0 && (
            <TreeLevel
              nodes={node.children as T[]}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggle={onToggle}
              activeDescendantIds={activeDescendantIds}
              renderNode={renderNode}
            />
          )}
        </SortableNode>
      ))}
    </SortableContext>
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

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const activeId = String(args.active.id);
      const activeParent = findParentId(activeId, treeData);
      const draggedNode = findNodeById(activeId, treeData);
      const descendantIds = draggedNode
        ? collectDescendantIds(draggedNode.children)
        : new Set<string>();

      const filtered = args.droppableContainers.filter((c) => {
        const id = String(c.id);
        if (descendantIds.has(id)) return false;
        return findParentId(id, treeData) === activeParent;
      });

      return closestCenter({ ...args, droppableContainers: filtered });
    },
    [treeData],
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

      const activeParentId = findParentId(draggedId, treeData);
      const overParentId = findParentId(overId, treeData);

      if (activeParentId !== overParentId) return;

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
    ? (findNodeById(activeId, treeData) as T | undefined)
    : null;

  const activeDescendantIds = useMemo(() => {
    if (!activeNode) return new Set<string>();
    return new Set(
      collectVisibleDescendants(activeNode, expandedIds).map((n) => n.id),
    );
  }, [activeNode, expandedIds]);

  return (
    <div className={cn(className)}>
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
        {treeData.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        ) : (
          <TreeLevel
            nodes={treeData}
            level={0}
            selectedId={selectedId}
            onSelect={onSelect}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            activeDescendantIds={activeDescendantIds}
            renderNode={renderNode}
          />
        )}
        <DragOverlay>
          {activeNode ? (
            renderOverlay ? (
              renderOverlay(activeNode)
            ) : (
              <div className="rounded-md shadow-md">
                {(() => {
                  const descendants = collectVisibleDescendants(
                    activeNode,
                    expandedIds,
                  );
                  const items = [activeNode, ...descendants];
                  return items.map((item, i) => {
                    const lvl = nodeLevels.get(item.id) ?? 0;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center gap-1.5 bg-background px-2 py-1.5 text-sm",
                          i === 0 && "rounded-t-md",
                          i === items.length - 1 && "rounded-b-md",
                        )}
                        style={{ paddingLeft: `${lvl * 16 + 8}px` }}
                      >
                        <span className="shrink-0 text-muted-foreground">
                          <GripVertical className="h-4 w-4" />
                        </span>
                        {item.icon && (
                          <span className="shrink-0">{item.icon}</span>
                        )}
                        <span className="truncate">{item.name}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            )
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
