import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Upload, Download, Copy, CheckSquare, Square, AlertCircle, Search, Settings, ArrowRight, Eye, X, Activity, Link as LinkIcon, ArrowDown, Map, Grid, Magnet, Trash2, Undo2, Redo2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import localforage from 'localforage';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function BlueprintViewer({ actions, selectedObject, selectedActions, setSelectedActions, onClose, onDuplicate, onUpdateActionPositions, onUpdateObjectData, blueprintFocusId, setBlueprintFocusId }: any) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [blueprintSearch, setBlueprintSearch] = useState('');
  const [selectedLinkId, setSelectedLinkId] = useState<number | null>(null);

  // Load/Save transform and selection
  useEffect(() => {
    const loadState = async () => {
      try {
        const savedTransform = await localforage.getItem(`blueprint_transform_${selectedObject.id}`);
        const savedSelection = await localforage.getItem(`blueprint_selection_${selectedObject.id}`);
        if (savedTransform) setTransform(savedTransform as any);
        if (savedSelection) setSelectedActions(new Set(savedSelection as any[]));
      } catch (err) {
        console.error('Failed to load blueprint state', err);
      }
    };
    loadState();
  }, [selectedObject.id]);

  useEffect(() => {
    const saveState = async () => {
      try {
        await localforage.setItem(`blueprint_transform_${selectedObject.id}`, transform);
        await localforage.setItem(`blueprint_selection_${selectedObject.id}`, Array.from(selectedActions));
      } catch (err) {
        console.error('Failed to save blueprint state', err);
      }
    };
    saveState();
  }, [transform, selectedActions, selectedObject.id]);

  const [localPositions, setLocalPositions] = useState<Record<string, {x: number, y: number}>>({});
  const [selectionBox, setSelectionBox] = useState<{startX: number, startY: number, currentX: number, currentY: number} | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [history, setHistory] = useState<Record<string, {x: number, y: number}>[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const saveToHistory = useCallback((positions: Record<string, {x: number, y: number}>) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push({ ...positions });
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevPositions = history[historyIndex - 1] as Record<string, { x: number, y: number }>;
      setLocalPositions(prevPositions);
      setHistoryIndex(historyIndex - 1);
      
      // Update parent
      const updates = Object.entries(prevPositions).map(([key, pos]) => {
        const isSc = key.includes('-sc-');
        const id = parseInt(key.split('-')[0]);
        const shortcutIdx = isSc ? parseInt(key.split('-')[2]) : undefined;
        return { id, shortcutIdx, x: pos.x, y: pos.y };
      });
      onUpdateActionPositions(updates);
    }
  }, [history, historyIndex, onUpdateActionPositions]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextPositions = history[historyIndex + 1] as Record<string, { x: number, y: number }>;
      setLocalPositions(nextPositions);
      setHistoryIndex(historyIndex + 1);
      
      // Update parent
      const updates = Object.entries(nextPositions).map(([key, pos]) => {
        const isSc = key.includes('-sc-');
        const id = parseInt(key.split('-')[0]);
        const shortcutIdx = isSc ? parseInt(key.split('-')[2]) : undefined;
        return { id, shortcutIdx, x: pos.x, y: pos.y };
      });
      onUpdateActionPositions(updates);
    }
  }, [history, historyIndex, onUpdateActionPositions]);

  const handleSearchFocus = (id: number | string) => {
    setBlueprintFocusId(id);
    setBlueprintSearch('');
  };
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
          e.preventDefault();
        } else if (e.key === 'y') {
          handleRedo();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  const [draggingNodes, setDraggingNodes] = useState<{
    startX: number,
    startY: number,
    nodes: { key: string, id: number, shortcutIdx?: number, initialX: number, initialY: number }[]
  } | null>(null);

  useEffect(() => {
    const GRID_SIZE = 24;
    const updates: { id: number, shortcutIdx?: number, x: number, y: number }[] = [];
    const newLocalPositions: Record<string, {x: number, y: number}> = {};
    let hasChanges = false;

    actions.forEach((a: any) => {
      const currentX = a.x ?? 0;
      const currentY = a.y ?? 0;
      const newX = Math.round(currentX / GRID_SIZE) * GRID_SIZE;
      const newY = Math.round(currentY / GRID_SIZE) * GRID_SIZE;

      if (currentX !== newX || currentY !== newY) {
        hasChanges = true;
      }

      newLocalPositions[`${a.id}`] = { x: newX, y: newY };
      updates.push({ id: a.id, x: newX, y: newY });

      if (a.shortcutList) {
        a.shortcutList.forEach((sc: any, idx: number) => {
          if (!sc) return;
          const scX = sc.x ?? 0;
          const scY = sc.y ?? 0;
          const newScX = Math.round(scX / GRID_SIZE) * GRID_SIZE;
          const newScY = Math.round(scY / GRID_SIZE) * GRID_SIZE;

          if (scX !== newScX || scY !== newScY) {
            hasChanges = true;
          }

          const scKey = `${a.id}-sc-${idx}`;
          newLocalPositions[scKey] = { x: newScX, y: newScY };
          updates.push({ id: a.id, shortcutIdx: idx, x: newScX, y: newScY });
        });
      }
    });

    setLocalPositions(newLocalPositions);
    setHistory([newLocalPositions]);
    setHistoryIndex(0);
    if (hasChanges) {
      onUpdateActionPositions(updates);
    }
  }, []); // Run once on mount

  const hasInitialFit = useRef<number | null>(null);

  useEffect(() => {
    if (hasInitialFit.current === selectedObject.id) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    actions.forEach((a: any) => {
      const ax = a.x || 0;
      const ay = a.y || 0;
      const aw = a.width ?? 168;
      const ah = a.height ?? 48;
      minX = Math.min(minX, ax);
      maxX = Math.max(maxX, ax + aw);
      minY = Math.min(minY, ay);
      maxY = Math.max(maxY, ay + ah);
      
      if (a.shortcutList) {
        a.shortcutList.forEach((sc: any) => {
          if (!sc) return;
          const scx = sc.x || 0;
          const scy = sc.y || 0;
          const scw = sc.width ?? 72;
          const sch = sc.height ?? 24;
          minX = Math.min(minX, scx);
          maxX = Math.max(maxX, scx + scw);
          minY = Math.min(minY, scy);
          maxY = Math.max(maxY, scy + sch);
        });
      }
    });

    if (minX === Infinity) {
      setTransform({ x: 0, y: 0, scale: 1 });
      hasInitialFit.current = selectedObject.id;
      return;
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    
    const containerWidth = window.innerWidth;
    const containerHeight = window.innerHeight - 56;
    
    const scaleX = (containerWidth - 100) / (contentWidth || 1);
    const scaleY = (containerHeight - 100) / (contentHeight || 1);
    const scale = Math.min(scaleX, scaleY, 1);
    
    const centerX = minX + contentWidth / 2;
    const centerY = minY + contentHeight / 2;
    
    const x = containerWidth / 2 - centerX * scale;
    const y = containerHeight / 2 - centerY * scale;
    
    setTransform({ x, y, scale });
    hasInitialFit.current = selectedObject.id;
  }, [actions, selectedObject.id]);

  // Focus on specific node
  useEffect(() => {
    if (blueprintFocusId !== null) {
      const key = blueprintFocusId.toString();
      const pos = localPositions[key];
      if (pos) {
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight - 56;
        const targetScale = 1;
        const x = containerWidth / 2 - pos.x * targetScale;
        const y = containerHeight / 2 - pos.y * targetScale;
        setTransform({ x, y, scale: targetScale });
        setSelectedActions(new Set([blueprintFocusId]));
      }
    }
  }, [blueprintFocusId, localPositions]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomSensitivity = 0.001;
      const delta = -e.deltaY * zoomSensitivity;
      
      setTransform(prev => {
        const newScale = Math.min(Math.max(0.05, prev.scale * (1 + delta * 3)), 5);
        
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const scaleRatio = newScale / prev.scale;
        const newX = mouseX - (mouseX - prev.x) * scaleRatio;
        const newY = mouseY - (mouseY - prev.y) * scaleRatio;
        
        return { x: newX, y: newY, scale: newScale };
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const [groups, setGroups] = useState<any[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const groupedMemberKeys = useMemo(() => {
    const keys = new Set<string>();
    (groups || []).forEach(g => {
      g.memberKeys.forEach((k: string) => keys.add(k));
    });
    return keys;
  }, [groups]);

  // Initialize groups from project data if available
  useEffect(() => {
    if (selectedObject && selectedObject._editorGroups) {
      setGroups(selectedObject._editorGroups);
    } else {
      setGroups([]);
    }
  }, [selectedObject?.id]);

  const groupRects = useMemo(() => {
    return groups.map(group => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasMembers = false;

      group.memberKeys.forEach((key: string) => {
        const isShortcut = key.includes('-sc-');
        const id = parseInt(key.split('-')[0]);
        const action = (actions || []).find((a: any) => a.id === id);
        if (!action) return;

        let x, y, w, h;
        if (isShortcut) {
          const idx = parseInt(key.split('-')[2]);
          const sc = action.shortcutList?.[idx];
          if (!sc) return;
          x = localPositions[key]?.x ?? sc.x ?? 0;
          y = localPositions[key]?.y ?? sc.y ?? 0;
          w = sc.width ?? 72;
          h = sc.height ?? 24;
        } else {
          x = localPositions[key]?.x ?? action.x ?? 0;
          y = localPositions[key]?.y ?? action.y ?? 0;
          w = action.width ?? 168;
          h = action.height ?? 48;
        }

        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w);
        maxY = Math.max(maxY, y + h);
        hasMembers = true;
      });

      if (!hasMembers) return null;

      return {
        ...group,
        x: minX - 20,
        y: minY - 40,
        w: maxX - minX + 40,
        h: maxY - minY + 60
      };
    }).filter(Boolean);
  }, [groups, actions, localPositions]);

  const handleCreateGroup = () => {
    if (selectedActions.size < 2) return;
    const newGroup = {
      id: `group-${Date.now()}`,
      name: `新建分组 ${groups.length + 1}`,
      memberKeys: Array.from(selectedActions).map(k => k.toString()),
      color: `hsla(${Math.random() * 360}, 70%, 50%, 0.15)`
    };
    const updatedGroups = [...groups, newGroup];
    setGroups(updatedGroups);
    
    // Persist to project data
    const updates = [{ id: selectedObject.id, groups: updatedGroups }];
    // We'll need a way to update object-level custom data
    onUpdateObjectData?.(selectedObject.id, { _editorGroups: updatedGroups });
  };

  const handleRemoveGroup = (groupId: string) => {
    const updatedGroups = groups.filter(g => g.id !== groupId);
    setGroups(updatedGroups);
    onUpdateObjectData?.(selectedObject.id, { _editorGroups: updatedGroups });
  };

  const handleRenameGroup = (groupId: string, newName: string) => {
    const updatedGroups = groups.map(g => g.id === groupId ? { ...g, name: newName } : g);
    setGroups(updatedGroups);
    onUpdateObjectData?.(selectedObject.id, { _editorGroups: updatedGroups });
    setEditingGroupId(null);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (contextMenu) setContextMenu(null);
    if (e.button === 0 && e.target === containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const startX = (e.clientX - rect.left - transform.x) / transform.scale;
      const startY = (e.clientY - rect.top - transform.y) / transform.scale;
      setSelectionBox({ startX, startY, currentX: startX, currentY: startY });
      if (!e.shiftKey) {
        setSelectedActions(new Set());
        setSelectedLinkId(null);
      }
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent, action: any, shortcutIdx?: number) => {
    if (contextMenu) setContextMenu(null);
    if (e.button !== 0) {
      // Allow right-click to bubble up to container for panning
      return;
    }
    e.stopPropagation();
    setSelectedLinkId(null);

    const key = shortcutIdx !== undefined ? `${action.id}-sc-${shortcutIdx}` : `${action.id}`;
    
    // Check if node belongs to a group
    const group = (groups || []).find(g => g.memberKeys.includes(key.toString()));
    if (group && !e.shiftKey) {
      const newSelection = new Set(group.memberKeys);
      setSelectedActions(newSelection);
    }

    // Normalize selection check to handle both string and number IDs
    const isSelected = selectedActions.has(key) || selectedActions.has(action.id) || (group && !e.shiftKey);

    let nodesToDrag: any[] = [];
    const addedKeys = new Set<string>();

    if (isSelected) {
      Array.from(selectedActions).forEach(selKey => {
        if (typeof selKey === 'string' && selKey.includes('-sc-')) {
          if (addedKeys.has(selKey)) return;
          const [idStr, , idxStr] = selKey.split('-');
          const id = parseInt(idStr);
          const idx = parseInt(idxStr);
          const a = (actions || []).find((act: any) => act.id === id);
          const sc = a?.shortcutList?.[idx];
          if (sc) {
            nodesToDrag.push({
              key: selKey,
              id,
              shortcutIdx: idx,
              initialX: localPositions[selKey]?.x ?? sc.x ?? 0,
              initialY: localPositions[selKey]?.y ?? sc.y ?? 0
            });
            addedKeys.add(selKey);
          }
        } else {
          const id = typeof selKey === 'string' ? parseInt(selKey) : (selKey as number);
          const k = `${id}`;
          if (addedKeys.has(k)) return;
          const a = (actions || []).find((act: any) => act.id === id);
          if (a) {
            nodesToDrag.push({
              key: k,
              id,
              initialX: localPositions[k]?.x ?? a.x ?? 0,
              initialY: localPositions[k]?.y ?? a.y ?? 0
            });
            addedKeys.add(k);
          }
        }
      });
    } else {
      const newId = shortcutIdx !== undefined ? key : action.id;
      setSelectedActions(new Set([newId]));
      
      // If clicking an action, just include the action in the drag
      if (shortcutIdx === undefined) {
        nodesToDrag.push({
          key,
          id: action.id,
          initialX: localPositions[key]?.x ?? action.x ?? 0,
          initialY: localPositions[key]?.y ?? action.y ?? 0
        });
        addedKeys.add(key);
      } else {
        // Just the shortcut
        nodesToDrag.push({
          key,
          id: action.id,
          shortcutIdx,
          initialX: localPositions[key]?.x ?? action.shortcutList?.[shortcutIdx]?.x ?? 0,
          initialY: localPositions[key]?.y ?? action.shortcutList?.[shortcutIdx]?.y ?? 0
        });
      }
    }

    setDraggingNodes({
      startX: e.clientX,
      startY: e.clientY,
      nodes: nodesToDrag
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedActions.size > 0) {
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      }));
    } else if (selectionBox && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const currentX = (e.clientX - rect.left - transform.x) / transform.scale;
      const currentY = (e.clientY - rect.top - transform.y) / transform.scale;

      setSelectionBox(prev => prev ? { ...prev, currentX, currentY } : null);

      const left = Math.min(selectionBox.startX, currentX);
      const right = Math.max(selectionBox.startX, currentX);
      const top = Math.min(selectionBox.startY, currentY);
      const bottom = Math.max(selectionBox.startY, currentY);

      const newSelected = new Set(e.shiftKey ? selectedActions : []);

      actions.forEach((a: any) => {
        const ax = localPositions[`${a.id}`]?.x ?? a.x ?? 0;
        const ay = localPositions[`${a.id}`]?.y ?? a.y ?? 0;
        const aw = a.width ?? 168;
        const ah = a.height ?? 48;

        if (ax < right && ax + aw > left && ay < bottom && ay + ah > top) {
          newSelected.add(a.id);
        }

        if (a.shortcutList) {
          a.shortcutList.forEach((sc: any, idx: number) => {
            if (!sc) return;
            const scKey = `${a.id}-sc-${idx}`;
            const scX = localPositions[scKey]?.x ?? sc.x ?? 0;
            const scY = localPositions[scKey]?.y ?? sc.y ?? 0;
            const scW = sc.width ?? 72;
            const scH = sc.height ?? 24;
            
            if (scX < right && scX + scW > left && scY < bottom && scY + scH > top) {
              newSelected.add(scKey);
            }
          });
        }
      });

      setSelectedActions(newSelected);
    } else if (draggingNodes) {
      const dx = (e.clientX - draggingNodes.startX) / transform.scale;
      const dy = (e.clientY - draggingNodes.startY) / transform.scale;

      const newPositions = { ...localPositions };
      draggingNodes.nodes.forEach(n => {
        let nx = n.initialX + dx;
        let ny = n.initialY + dy;
        
        if (snapEnabled) {
          nx = Math.round(nx / 24) * 24;
          ny = Math.round(ny / 24) * 24;
        } else {
          nx = Math.round(nx);
          ny = Math.round(ny);
        }

        newPositions[n.key] = { x: nx, y: ny };
      });
      setLocalPositions(newPositions);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err) {}
    }
    if (selectionBox) {
      setSelectionBox(null);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err) {}
    }
    if (draggingNodes) {
      const updates = draggingNodes.nodes.map(n => ({
        id: n.id,
        shortcutIdx: n.shortcutIdx,
        x: localPositions[n.key]?.x ?? n.initialX,
        y: localPositions[n.key]?.y ?? n.initialY
      }));
      onUpdateActionPositions(updates);
      saveToHistory(localPositions);
      setDraggingNodes(null);
      try { (e.target as any).releasePointerCapture(e.pointerId); } catch(err) {}
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch(err) {}
    }
  };

  const getEdgePoints = (sourceRect: any, targetRect: any) => {
    const sx = sourceRect.x + sourceRect.w / 2;
    const sy = sourceRect.y + sourceRect.h / 2;
    const tx = targetRect.x + targetRect.w / 2;
    const ty = targetRect.y + targetRect.h / 2;

    const dx = tx - sx;
    const dy = ty - sy;

    let x1, y1, x2, y2;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        x1 = sourceRect.x + sourceRect.w; y1 = sy;
        x2 = targetRect.x; y2 = ty;
      } else {
        x1 = sourceRect.x; y1 = sy;
        x2 = targetRect.x + targetRect.w; y2 = ty;
      }
    } else {
      if (dy > 0) {
        x1 = sx; y1 = sourceRect.y + sourceRect.h;
        x2 = tx; y2 = targetRect.y;
      } else {
        x1 = sx; y1 = sourceRect.y;
        x2 = tx; y2 = targetRect.y + targetRect.h;
      }
    }
    return { x1, y1, x2, y2 };
  };

  const getBezierPath = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    if (dx > dy) {
      const offset = Math.max(dx / 2, 30);
      return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
    } else {
      const offset = Math.max(dy / 2, 30);
      return `M ${x1} ${y1} C ${x1} ${y1 + offset}, ${x2} ${y2 - offset}, ${x2} ${y2}`;
    }
  };

  const handleSnapToGrid = () => {
    const GRID_SIZE = 24;
    const updates: { id: number, shortcutIdx?: number, x: number, y: number }[] = [];
    const newLocalPositions = { ...localPositions };

    const targetIds = selectedActions.size > 0 
      ? Array.from(selectedActions) 
      : (actions || []).map((a: any) => a.id);

    targetIds.forEach(id => {
      const a = (actions || []).find((act: any) => act.id === id);
      if (!a) return;

      const currentX = localPositions[`${id}`]?.x ?? a.x ?? 0;
      const currentY = localPositions[`${id}`]?.y ?? a.y ?? 0;
      const newX = Math.round(currentX / GRID_SIZE) * GRID_SIZE;
      const newY = Math.round(currentY / GRID_SIZE) * GRID_SIZE;

      newLocalPositions[`${id}`] = { x: newX, y: newY };
      updates.push({ id: id as number, x: newX, y: newY });

      if (a.shortcutList) {
        a.shortcutList.forEach((sc: any, idx: number) => {
          if (!sc) return;
          const scKey = `${id}-sc-${idx}`;
          const scX = localPositions[scKey]?.x ?? sc.x ?? 0;
          const scY = localPositions[scKey]?.y ?? sc.y ?? 0;
          const newScX = Math.round(scX / GRID_SIZE) * GRID_SIZE;
          const newScY = Math.round(scY / GRID_SIZE) * GRID_SIZE;

          newLocalPositions[scKey] = { x: newScX, y: newScY };
          updates.push({ id: id as number, shortcutIdx: idx, x: newScX, y: newScY });
        });
      }
    });

    setLocalPositions(newLocalPositions);
    onUpdateActionPositions(updates);
  };

  const allLinks = selectedObject.actionLinkList || selectedObject.links || [];

  const { highlightedActionIds, highlightedLinkIndices } = useMemo(() => {
    if (!highlightEnabled) {
      return { highlightedActionIds: null, highlightedLinkIndices: null };
    }

    const hActions = new Set<number | string>();
    const hLinks = new Set<number>();

    if (selectedActions.size === 0 && selectedLinkId === null) {
      return { highlightedActionIds: null, highlightedLinkIndices: null };
    }

    if (selectedLinkId !== null) {
      hLinks.add(selectedLinkId);
      const l = allLinks[selectedLinkId];
      if (l) {
        const sourceId = l.typeIdPair ? l.typeIdPair[0][1] : l.actionId;
        const targetId = l.typeIdPair ? l.typeIdPair[1][1] : l.targetActionId;
        const sourceShortcutIdx = (l.typeIdPair && l.typeIdPair[0].length > 2) ? l.typeIdPair[0][2] : -1;
        const targetShortcutIdx = (l.typeIdPair && l.typeIdPair[1].length > 2) ? l.typeIdPair[1][2] : -1;
        
        hActions.add(sourceId);
        hActions.add(targetId);
        if (sourceShortcutIdx >= 0) hActions.add(`${sourceId}-sc-${sourceShortcutIdx}`);
        if (targetShortcutIdx >= 0) hActions.add(`${targetId}-sc-${targetShortcutIdx}`);
      }
    }

    selectedActions.forEach((id: any) => {
      hActions.add(id);
      if (typeof id === 'string' && id.includes('-sc-')) {
        const baseId = parseInt(id.split('-sc-')[0], 10);
        if (!isNaN(baseId)) hActions.add(baseId);
      }
    });

    allLinks.forEach((l: any, idx: number) => {
      const sourceId = l.typeIdPair ? l.typeIdPair[0][1] : l.actionId;
      const targetId = l.typeIdPair ? l.typeIdPair[1][1] : l.targetActionId;
      const sourceShortcutIdx = (l.typeIdPair && l.typeIdPair[0].length > 2) ? l.typeIdPair[0][2] : -1;
      const targetShortcutIdx = (l.typeIdPair && l.typeIdPair[1].length > 2) ? l.typeIdPair[1][2] : -1;
      
      const sourceKey = sourceShortcutIdx >= 0 ? `${sourceId}-sc-${sourceShortcutIdx}` : sourceId;
      const targetKey = targetShortcutIdx >= 0 ? `${targetId}-sc-${targetShortcutIdx}` : targetId;

      if (selectedActions.has(sourceId) || selectedActions.has(targetId) || selectedActions.has(sourceKey) || selectedActions.has(targetKey)) {
        hLinks.add(idx);
        hActions.add(sourceId);
        hActions.add(targetId);
        if (sourceShortcutIdx >= 0) hActions.add(`${sourceId}-sc-${sourceShortcutIdx}`);
        if (targetShortcutIdx >= 0) hActions.add(`${targetId}-sc-${targetShortcutIdx}`);
      }
    });

    return { highlightedActionIds: hActions, highlightedLinkIndices: hLinks };
  }, [selectedActions, selectedLinkId, allLinks, highlightEnabled]);

  const memoizedLinks = useMemo(() => {
    return allLinks.map((l: any, idx: number) => {
      const sourceId = l.typeIdPair ? l.typeIdPair[0][1] : l.actionId;
      const targetId = l.typeIdPair ? l.typeIdPair[1][1] : l.targetActionId;
      const sourceShortcutIdx = (l.typeIdPair && l.typeIdPair[0].length > 2) ? l.typeIdPair[0][2] : -1;
      const targetShortcutIdx = (l.typeIdPair && l.typeIdPair[1].length > 2) ? l.typeIdPair[1][2] : -1;

      const source = (actions || []).find((a: any) => a.id === sourceId);
      const target = (actions || []).find((a: any) => a.id === targetId);
      if (!source || !target) return null;

      const sourceKey = sourceShortcutIdx >= 0 ? `${sourceId}-sc-${sourceShortcutIdx}` : `${sourceId}`;
      const targetKey = targetShortcutIdx >= 0 ? `${targetId}-sc-${targetShortcutIdx}` : `${targetId}`;

      let isDirectlySelected = selectedLinkId === idx;
      if (!isDirectlySelected && selectedActions.size > 0) {
        isDirectlySelected = selectedActions.has(sourceId) || selectedActions.has(targetId) || selectedActions.has(sourceKey) || selectedActions.has(targetKey);
      }
      
      const isHighlighted = highlightedLinkIndices === null || highlightedLinkIndices.has(idx);
      
      let baseColor = '#ffffff';
      if (l.r !== undefined && l.g !== undefined && l.b !== undefined) {
        baseColor = `rgba(${l.r}, ${l.g}, ${l.b}, ${l.a !== undefined ? l.a / 255 : 1})`;
      }
      
      const strokeColor = isDirectlySelected ? '#3b82f6' : baseColor;
      const strokeWidth = isDirectlySelected ? "3" : "2";
      const opacity = isHighlighted ? 1 : 0.15;
      const marker = 'url(#arrowhead)';

      // Hide links connected to grouped items (since they are hidden inside the group box)
      if (groupedMemberKeys.has(sourceKey) || groupedMemberKeys.has(targetKey)) return null;

      let sourceX = source.x ?? 0;
      let sourceY = source.y ?? 0;
      let sourceW = source.width ?? 168;
      let sourceH = source.height ?? 48;
      if (sourceShortcutIdx >= 0 && source.shortcutList?.[sourceShortcutIdx]) {
        sourceX = source.shortcutList[sourceShortcutIdx].x ?? 0;
        sourceY = source.shortcutList[sourceShortcutIdx].y ?? 0;
        sourceW = source.shortcutList[sourceShortcutIdx].width ?? 72;
        sourceH = source.shortcutList[sourceShortcutIdx].height ?? 24;
      }
      sourceX = localPositions[sourceKey]?.x ?? sourceX;
      sourceY = localPositions[sourceKey]?.y ?? sourceY;

      let targetX = target.x ?? 0;
      let targetY = target.y ?? 0;
      let targetW = target.width ?? 168;
      let targetH = target.height ?? 48;
      if (targetShortcutIdx >= 0 && target.shortcutList?.[targetShortcutIdx]) {
        targetX = target.shortcutList[targetShortcutIdx].x ?? 0;
        targetY = target.shortcutList[targetShortcutIdx].y ?? 0;
        targetW = target.shortcutList[targetShortcutIdx].width ?? 72;
        targetH = target.shortcutList[targetShortcutIdx].height ?? 24;
      }
      targetX = localPositions[targetKey]?.x ?? targetX;
      targetY = localPositions[targetKey]?.y ?? targetY;

      const isSourceMoved = !!localPositions[sourceKey];
      const isTargetMoved = !!localPositions[targetKey];

      let pathData = '';
      let midX = 0, midY = 0;

      if (Array.isArray(l.coordList) && l.coordList.length > 0 && !isSourceMoved && !isTargetMoved) {
        pathData = `M ${l.coordList[0][0]} ${l.coordList[0][1]} ` + l.coordList.slice(1).map((c: number[]) => `L ${c[0]} ${c[1]}`).join(' ');
        
        const midIndex = Math.floor(l.coordList.length / 2);
        midX = l.coordList[midIndex][0];
        midY = l.coordList[midIndex][1];
        
        return (
          <g key={idx} 
             style={{ opacity, cursor: 'pointer' }}
             onClick={(e) => {
               e.stopPropagation();
               setSelectedActions(new Set());
               setSelectedLinkId(idx);
             }}
          >
            <path d={pathData} fill="none" stroke="transparent" strokeWidth="15" />
            <path d={pathData} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} markerEnd={marker} strokeLinejoin="round" />
            <rect x={midX - 5} y={midY - 5} width="10" height="10" fill={strokeColor} stroke="white" strokeWidth="1" rx="1" transform={`rotate(45 ${midX} ${midY})`} />
          </g>
        );
      } else {
        const { x1, y1, x2, y2 } = getEdgePoints(
          { x: sourceX, y: sourceY, w: sourceW, h: sourceH },
          { x: targetX, y: targetY, w: targetW, h: targetH }
        );
        
        pathData = getBezierPath(x1, y1, x2, y2);
        midX = (x1 + x2) / 2;
        midY = (y1 + y2) / 2;

        return (
          <g key={idx} 
             style={{ opacity, cursor: 'pointer' }}
             onClick={(e) => {
               e.stopPropagation();
               setSelectedActions(new Set());
               setSelectedLinkId(idx);
             }}
          >
            <path d={pathData} fill="none" stroke="transparent" strokeWidth="15" />
            <path d={pathData} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} markerEnd={marker} />
            <rect x={midX - 5} y={midY - 5} width="10" height="10" fill={strokeColor} stroke="white" strokeWidth="1" rx="1" transform={`rotate(45 ${midX} ${midY})`} />
          </g>
        );
      }
    });
  }, [allLinks, localPositions, selectedActions, selectedLinkId, actions, highlightedLinkIndices]);

  return (
    <div className="fixed inset-0 bg-[#111111] z-50 flex flex-col" onPointerUp={handlePointerUp}>
      {/* Header */}
      <div className="h-14 border-b border-slate-800 bg-[#1a1a1a] flex items-center justify-between px-6 shrink-0 shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center border border-indigo-500/30">
            <Map className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">蓝图全览 (Blueprint View)</h2>
            <p className="text-xs text-slate-400">对象: {selectedObject.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="蓝图中搜索..." 
              value={blueprintSearch}
              onChange={(e) => setBlueprintSearch(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-md pl-9 pr-4 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors w-48"
            />
            {blueprintSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-xl max-h-60 overflow-y-auto z-50 custom-scrollbar">
                {actions.filter((a: any) => a.name?.toLowerCase().includes(blueprintSearch.toLowerCase()) || a.id.toString().includes(blueprintSearch)).map((a: any) => (
                  <button
                    key={a.id}
                    onClick={() => handleSearchFocus(a.id)}
                    className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-indigo-600 hover:text-white border-b border-slate-700 last:border-0"
                  >
                    <span className="text-slate-500 mr-2">#{a.id}</span>
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-4 mr-4">
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-blue-600 rounded-sm border border-blue-400"></div> 已选中</span>
            <span className="flex items-center gap-1.5"><div className="w-3 h-3 bg-[#333333] rounded-sm border border-slate-700"></div> 未选中</span>
            <span>提示: 拖拽空白处或右键移动画布，滚轮缩放，框选移动</span>
          </div>
          <button 
            onClick={() => setHighlightEnabled(!highlightEnabled)}
            className={`p-2 rounded-lg transition-colors ${highlightEnabled ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="开启/关闭高亮显示 (Toggle Highlight)"
          >
            <Eye className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`p-2 rounded-lg transition-colors ${snapEnabled ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            title="拖拽时吸附网格 (Toggle Snap to Grid)"
          >
            <Magnet className="w-5 h-5" />
          </button>
          <button 
            onClick={handleSnapToGrid}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="一键对齐到网格 (Align Selected to Grid)"
          >
            <Grid className="w-5 h-5" />
          </button>
          <div className="w-px h-6 bg-slate-800 mx-1" />
          <button 
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="撤销 (Undo)"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          <button 
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="重做 (Redo)"
          >
            <Redo2 className="w-5 h-5" />
          </button>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div 
        ref={containerRef}
        className={`flex-1 overflow-hidden relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        {/* Infinite Grid */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: '#1a202c',
            backgroundImage: `
              linear-gradient(to right, rgba(66, 153, 225, 0.2) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(66, 153, 225, 0.2) 1px, transparent 1px)
            `,
            backgroundSize: `${24 * transform.scale}px ${24 * transform.scale}px`,
            backgroundPosition: `${transform.x}px ${transform.y}px`,
          }}
        />

        {/* Transform Container */}
        <div 
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          }}
        >
          {/* Groups Background */}
          {groupRects.map((g: any) => (
            <div
              key={g.id}
              className="absolute border-2 border-dashed rounded-lg group/groupbox"
              style={{
                left: g.x,
                top: g.y,
                width: g.w,
                height: g.h,
                backgroundColor: g.color.replace('0.15', '1'), // Solid background
                borderColor: g.color.replace('0.15', '0.8'),
                zIndex: 5
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                // If clicking on input, buttons, or the name span, don't start dragging here
                if ((e.target as HTMLElement).closest('button') || 
                    (e.target as HTMLElement).closest('input') ||
                    (e.target as HTMLElement).closest('.group-name-label')) return;
                
                e.stopPropagation();
                setSelectedActions(new Set(g.memberKeys));
                
                const nodesToDrag: any[] = [];
                g.memberKeys.forEach((mKey: string) => {
                  const isSc = mKey.includes('-sc-');
                  const id = parseInt(mKey.split('-')[0]);
                  const a = (actions || []).find((act: any) => act.id === id);
                  if (!a) return;
                  
                  if (isSc) {
                    const idx = parseInt(mKey.split('-')[2]);
                    const sc = a.shortcutList?.[idx];
                    if (sc) {
                      nodesToDrag.push({
                        key: mKey,
                        id,
                        shortcutIdx: idx,
                        initialX: localPositions[mKey]?.x ?? sc.x ?? 0,
                        initialY: localPositions[mKey]?.y ?? sc.y ?? 0
                      });
                    }
                  } else {
                    nodesToDrag.push({
                      key: mKey,
                      id,
                      initialX: localPositions[mKey]?.x ?? a.x ?? 0,
                      initialY: localPositions[mKey]?.y ?? a.y ?? 0
                    });
                  }
                });

                setDraggingNodes({
                  startX: e.clientX,
                  startY: e.clientY,
                  nodes: nodesToDrag
                });
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
            >
              <div className="absolute top-2 left-2 flex items-center gap-2">
                {editingGroupId === g.id ? (
                  <input
                    autoFocus
                    className="bg-slate-800 text-white text-xs px-2 py-1 rounded border border-blue-500 outline-none"
                    defaultValue={g.name}
                    onBlur={(e) => handleRenameGroup(g.id, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameGroup(g.id, e.currentTarget.value)}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="flex items-center gap-1">
                    <span 
                      className="group-name-label text-xs font-bold px-2 py-1 rounded bg-black/40 text-white cursor-text hover:bg-black/60 flex items-center gap-2"
                      onClick={(e) => { e.stopPropagation(); setEditingGroupId(g.id); }}
                    >
                      {g.name}
                      <span className="text-[10px] opacity-70 font-normal">({g.memberKeys.length} 节点)</span>
                    </span>
                  </div>
                )}
                <button 
                  onClick={(e) => { e.stopPropagation(); handleRemoveGroup(g.id); }}
                  className="opacity-0 group-hover/groupbox:opacity-100 p-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white rounded transition-all"
                  title="解散分组"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div className="w-full h-full flex items-center justify-center pointer-events-none">
                <Activity className="w-6 h-6 text-white/10" />
              </div>
            </div>
          ))}

          {/* Links SVG */}
          <svg className="absolute top-0 left-0 overflow-visible pointer-events-none" style={{ width: 1, height: 1 }}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="context-stroke" />
              </marker>
            </defs>
            {memoizedLinks}
          </svg>

          {/* Actions */}
          {actions.map((a: any) => {
            const isSelected = selectedActions.has(a.id);
            const isHighlighted = highlightedActionIds === null || highlightedActionIds.has(a.id);
            const opacity = isHighlighted ? 1 : 0.2;
            const isDefault = a.id === selectedObject.defaultActionId;
            const currentX = localPositions[`${a.id}`]?.x ?? a.x ?? 0;
            const currentY = localPositions[`${a.id}`]?.y ?? a.y ?? 0;
            const aw = a.width ?? 168;
            const ah = a.height ?? 48;

            // Render all actions, even if they are in a group
            const bgColor = (a.r !== undefined && a.g !== undefined && a.b !== undefined) 
              ? `rgba(${a.r}, ${a.g}, ${a.b}, ${a.a !== undefined ? a.a / 255 : 1})`
              : '#2a2a2a';
            const textColor = (a.r !== undefined && a.r + a.g + a.b > 382) ? '#000000' : '#ffffff';

            return (
              <React.Fragment key={a.id}>
                <div
                  className={`absolute rounded-sm shadow-md text-[11px] font-medium border cursor-pointer select-none ${
                    isSelected 
                      ? 'border-blue-400 z-20 shadow-[0_0_10px_rgba(59,130,246,0.5)]' 
                      : 'border-black/40 z-10 hover:border-white/20'
                  }`}
                  style={{
                    left: currentX,
                    top: currentY,
                    width: aw,
                    height: ah,
                    backgroundColor: bgColor,
                    color: textColor,
                    opacity,
                  }}
                  onPointerDown={(e) => handleNodePointerDown(e, a)}
                  title={`ID: ${a.id}\n名称: ${a.name || '未命名'}\n运行条件: ${a.runtimeConditionList?.map((c: any) => c.name).join(', ') || '无'}`}
                >
                  <div className="w-full h-full flex flex-col">
                    <div className={`px-1.5 py-0.5 flex items-center gap-1 border-b border-black/20 ${
                      isDefault ? 'bg-amber-500/60' : 'bg-black/20'
                    } rounded-t-[1px]`}>
                      <span className="truncate font-bold flex-1">{a.name || '未命名'}</span>
                      <span className="text-[9px] opacity-60 ml-auto">#{a.id}</span>
                    </div>
                    <div className="px-1.5 py-1 text-[9px] opacity-90 flex flex-col justify-center flex-1 rounded-b-[1px] overflow-hidden">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate flex-1 text-white/70 italic">
                          {a.runtimeConditionList?.length > 0 
                            ? a.runtimeConditionList.map((c: any) => c.name).join(', ') 
                            : '无运行条件'}
                        </span>
                        <div className="flex gap-0.5 shrink-0">
                          {a.runtimeConditionList?.slice(0, 2).map((_: any, i: number) => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400/40"></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shortcut Boxes */}
                {a.shortcutList?.map((sc: any, idx: number) => {
                  if (!sc) return null;
                  const scKey = `${a.id}-sc-${idx}`;
                  
                  const isScSelected = selectedActions.has(scKey);
                  const isScHighlighted = highlightedActionIds === null || highlightedActionIds.has(a.id) || highlightedActionIds.has(scKey);
                  const scOpacity = isScHighlighted ? 0.7 : 0.2;
                  const scX = localPositions[scKey]?.x ?? sc.x ?? 0;
                  const scY = localPositions[scKey]?.y ?? sc.y ?? 0;
                  const scW = sc.width ?? 72;
                  const scH = sc.height ?? 24;
                  return (
                    <div
                      key={scKey}
                      className={`absolute rounded-sm shadow-sm text-[10px] font-medium border border-dashed cursor-pointer select-none overflow-hidden ${
                        isScSelected ? 'border-blue-400 z-20 shadow-[0_0_5px_rgba(59,130,246,0.5)]' : 'border-white/30 z-10 hover:border-white/50'
                      }`}
                      style={{
                        left: scX,
                        top: scY,
                        width: scW,
                        height: scH,
                        backgroundColor: bgColor,
                        color: textColor,
                        opacity: scOpacity,
                      }}
                      onPointerDown={(e) => handleNodePointerDown(e, a, idx)}
                      title={`Shortcut for ID: ${a.id}\n${a.name}`}
                    >
                      <div className="px-1 text-center truncate leading-none flex items-center justify-center h-full italic">
                        {a.name || '未命名'}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}

          {/* Selection Box */}
          {selectionBox && (
            <div
              className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-50"
              style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
              }}
            />
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-[100] bg-slate-800 border border-slate-700 rounded-md shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-700 mb-1">
            已选中 {selectedActions.size} 个节点
          </div>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-indigo-600 hover:text-white flex items-center gap-2"
            onClick={() => {
              handleCreateGroup();
              setContextMenu(null);
            }}
            disabled={selectedActions.size < 2}
          >
            <Square className="w-4 h-4" />
            创建分组 (Group)
          </button>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-indigo-600 hover:text-white flex items-center gap-2"
            onClick={() => {
              onDuplicate();
              setContextMenu(null);
            }}
          >
            <Copy className="w-4 h-4" />
            复制选中节点
          </button>
          <button 
            className="w-full text-left px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 flex items-center gap-2"
            onClick={() => {
              setSelectedActions(new Set());
              setContextMenu(null);
            }}
          >
            <Square className="w-4 h-4" />
            取消全选
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [projectData, setProjectData] = useState<any>(null);
  const [fileName, setFileName] = useState<string>('');
  const [objectsPath, setObjectsPath] = useState<string[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<number | string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [duplicateCount, setDuplicateCount] = useState(1);
  const [duplicateLinks, setDuplicateLinks] = useState(true);
  const [offsetX, setOffsetX] = useState(300);
  const [offsetY, setOffsetY] = useState(0);
  const [previewActionId, setPreviewActionId] = useState<number | null>(null);
  const [showBlueprint, setShowBlueprint] = useState(false);
  const [blueprintFocusId, setBlueprintFocusId] = useState<number | string | null>(null);
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchNamePrefix, setBatchNamePrefix] = useState('');
  const [batchNameSuffix, setBatchNameSuffix] = useState('');
  const [batchColor, setBatchColor] = useState({ r: 42, g: 42, b: 42, a: 255 });
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Persistence logic
  useEffect(() => {
    const loadData = async () => {
      try {
        const savedProject = await localforage.getItem('pgmmv_project_data');
        const savedFileName = await localforage.getItem('pgmmv_file_name');
        const savedPath = await localforage.getItem('pgmmv_objects_path');
        const savedObjectId = await localforage.getItem('pgmmv_selected_object_id');

        if (savedProject) {
          setProjectData(savedProject);
          if (savedFileName) setFileName(savedFileName as string);
          if (savedPath) setObjectsPath(savedPath as string[]);
          if (savedObjectId) setSelectedObjectId(savedObjectId as number);
          setStatusMessage({ type: 'info', text: '已从本地缓存恢复上次的项目进度。' });
        }
      } catch (err) {
        console.error('Failed to load from localforage', err);
      } finally {
        setIsInitialized(true);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    const saveData = async () => {
      try {
        if (projectData) {
          await localforage.setItem('pgmmv_project_data', projectData);
          await localforage.setItem('pgmmv_file_name', fileName);
          await localforage.setItem('pgmmv_objects_path', objectsPath);
          await localforage.setItem('pgmmv_selected_object_id', selectedObjectId);
        } else {
          await localforage.clear();
        }
      } catch (err) {
        console.error('Failed to save to localforage', err);
      }
    };
    saveData();
  }, [projectData, fileName, objectsPath, selectedObjectId, isInitialized]);

  const handleClearProject = async () => {
    if (window.confirm('确定要清除当前项目吗？未保存的更改将丢失。')) {
      setProjectData(null);
      setFileName('');
      setObjectsPath([]);
      setSelectedObjectId(null);
      setSelectedActionIds(new Set());
      await localforage.clear();
      setStatusMessage({ type: 'info', text: '项目已清除。' });
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to find the objects array in the JSON
  const findObjectsArray = (data: any): { path: string[], objects: any[] } | null => {
    const collect = (list: any[]): any[] => {
      let res: any[] = [];
      if (!Array.isArray(list)) return res;
      list.forEach(item => {
        if (item.folder) {
          if (Array.isArray(item.objectList)) res = res.concat(collect(item.objectList));
          if (Array.isArray(item.children)) res = res.concat(collect(item.children));
        } else if (item.actionList || item.actions) {
          res.push(item);
        }
      });
      return res;
    };

    // Standard PGMMV project structure
    if (data && Array.isArray(data.objectList)) {
      const allObjects = collect(data.objectList);
      if (allObjects.length > 0) {
        return { path: ['objectList'], objects: allObjects };
      }
    }
    
    // Fallbacks for other structures
    if (data && Array.isArray(data.objects) && data.objects.length > 0 && (data.objects[0].actions || data.objects[0].actionList)) {
      const allObjects = collect(data.objects);
      return { path: ['objects'], objects: allObjects };
    }
    if (data && data.project && Array.isArray(data.project.objects) && data.project.objects.length > 0 && (data.project.objects[0].actions || data.project.objects[0].actionList)) {
      const allObjects = collect(data.project.objects);
      return { path: ['project', 'objects'], objects: allObjects };
    }
    // Deep search (1 level)
    for (const key in data) {
      if (Array.isArray(data[key]) && data[key].length > 0 && (data[key][0].actions || data[key][0].actionList)) {
        const allObjects = collect(data[key]);
        if (allObjects.length > 0) {
          return { path: [key], objects: allObjects };
        }
      }
    }
    return null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setStatusMessage({ type: 'info', text: '正在解析项目文件...' });

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const found = findObjectsArray(json);
        
        if (found) {
          setProjectData(json);
          setObjectsPath(found.path);
          setSelectedObjectId(null);
          setSelectedActionIds(new Set());
          setStatusMessage({ type: 'success', text: `成功加载项目！找到 ${found.objects.length} 个对象。` });
        } else {
          setStatusMessage({ type: 'error', text: '无法在文件中找到有效的对象数据结构。请确保这是正确的 PGMMV 项目文件。' });
        }
      } catch (err) {
        setStatusMessage({ type: 'error', text: '文件解析失败，请确保它是有效的 JSON 格式。' });
      }
    };
    reader.readAsText(file);
  };

  const getObjects = () => {
    if (!projectData) return [];
    let root = projectData;
    for (const key of objectsPath) {
      root = root[key];
    }
    
    const collect = (list: any[]): any[] => {
      let res: any[] = [];
      if (!Array.isArray(list)) return res;
      list.forEach(item => {
        if (item.folder) {
          if (Array.isArray(item.objectList)) res = res.concat(collect(item.objectList));
          if (Array.isArray(item.children)) res = res.concat(collect(item.children));
        } else if (item.actionList || item.actions) {
          res.push(item);
        }
      });
      return res;
    };
    
    return collect(root);
  };

  const objects = getObjects();
  const selectedObject = (objects || []).find((o: any) => o.id === selectedObjectId);
  const actions = selectedObject?.actionList || selectedObject?.actions || [];

  const filteredActions = useMemo(() => {
    if (!searchQuery) return actions;
    return actions.filter((a: any) => 
      (a.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(a.id).includes(searchQuery)
    );
  }, [actions, searchQuery]);

  const toggleActionSelection = (id: number) => {
    const newSet = new Set(selectedActionIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedActionIds(newSet);
  };

  const handleUpdateObjectData = (objectId: number, data: any) => {
    if (!projectData) return;
    
    // Surgical update
    const newData = { ...projectData };
    let current = newData;
    for (const key of objectsPath) {
      current[key] = Array.isArray(current[key]) ? [...current[key]] : { ...current[key] };
      current = current[key];
    }

    const findAndCloneObj = (root: any, id: number): any => {
      if (Array.isArray(root)) {
        for (let i = 0; i < root.length; i++) {
          const res = findAndCloneObj(root[i], id);
          if (res) {
            root[i] = { ...root[i] };
            return res;
          }
        }
      } else if (root && typeof root === 'object') {
        if (root.id === id && !root.folder) return root;
        const keysToTraverse = ['objectList', 'children'];
        for (const key of keysToTraverse) {
          if (Array.isArray(root[key])) {
            const res = findAndCloneObj(root[key], id);
            if (res) {
              root[key] = [...root[key]];
              return res;
            }
          }
        }
      }
      return null;
    };

    const targetObj = findAndCloneObj(current, objectId);
    if (targetObj) {
      Object.assign(targetObj, data);
      startTransition(() => {
        setProjectData(newData);
      });
    }
  };

  const selectAll = () => {
    const newSet = new Set(filteredActions.map((a: any) => a.id));
    setSelectedActionIds(newSet);
  };

  const deselectAll = () => {
    setSelectedActionIds(new Set());
  };

  const [isPending, startTransition] = React.useTransition();

  const handleUpdateActionPositions = (updates: { id: number, shortcutIdx?: number, x: number, y: number }[]) => {
    if (!selectedObject || !projectData) return;
    
    // Surgical update to avoid full deep clone bottleneck
    const newData = { ...projectData };
    let current = newData;
    
    // Clone the path to the selected object
    for (let i = 0; i < objectsPath.length; i++) {
      const key = objectsPath[i];
      if (Array.isArray(current[key])) {
        current[key] = [...current[key]];
      } else {
        current[key] = { ...current[key] };
      }
      current = current[key];
    }

    const findAndCloneObj = (root: any, id: number): any => {
      if (Array.isArray(root)) {
        for (let i = 0; i < root.length; i++) {
          const res = findAndCloneObj(root[i], id);
          if (res) {
            root[i] = { ...root[i] }; // Clone the object in the array
            return res;
          }
        }
      } else if (root && typeof root === 'object') {
        if (root.id === id && !root.folder) return root;
        const keysToTraverse = ['objectList', 'children'];
        for (const key of keysToTraverse) {
          if (Array.isArray(root[key])) {
            const res = findAndCloneObj(root[key], id);
            if (res) {
              root[key] = [...root[key]]; // Clone the array
              return res;
            }
          }
        }
      }
      return null;
    };

    const targetObj = findAndCloneObj(current, selectedObjectId);
    if (targetObj) {
      const targetActions = targetObj.actionList || targetObj.actions;
      const movedKeys = new Set(updates.map(u => u.shortcutIdx !== undefined ? `${u.id}-sc-${u.shortcutIdx}` : `${u.id}`));
      const movedActionIds = new Set(updates.filter(u => u.shortcutIdx === undefined).map(u => u.id));

      updates.forEach(update => {
        const action = (targetActions || []).find((a: any) => a.id === update.id);
        if (action) {
          if (update.shortcutIdx !== undefined && action.shortcutList?.[update.shortcutIdx]) {
            // Clone shortcut list and shortcut object
            action.shortcutList = [...action.shortcutList];
            action.shortcutList[update.shortcutIdx] = { 
              ...action.shortcutList[update.shortcutIdx],
              x: Math.round(update.x),
              y: Math.round(update.y)
            };
          } else {
            action.x = Math.round(update.x);
            action.y = Math.round(update.y);
          }
        }
      });
      
      const targetLinks = targetObj.actionLinkList || targetObj.links;
      if (targetLinks) {
        targetObj.actionLinkList = targetLinks.map((link: any) => {
          const sourceId = link.typeIdPair ? link.typeIdPair[0][1] : link.actionId;
          const targetId = link.typeIdPair ? link.typeIdPair[1][1] : link.targetActionId;
          const sourceShortcutIdx = (link.typeIdPair && link.typeIdPair[0].length > 2) ? link.typeIdPair[0][2] : -1;
          const targetShortcutIdx = (link.typeIdPair && link.typeIdPair[1].length > 2) ? link.typeIdPair[1][2] : -1;
          
          const sourceKey = sourceShortcutIdx >= 0 ? `${sourceId}-sc-${sourceShortcutIdx}` : `${sourceId}`;
          const targetKey = targetShortcutIdx >= 0 ? `${targetId}-sc-${targetShortcutIdx}` : `${targetId}`;

          if (movedKeys.has(sourceKey) || movedKeys.has(targetKey)) {
            return { ...link, coordList: [] }; // Clear and clone link
          }
          return link;
        });
        // Handle the case where it was called 'links'
        if (targetObj.links) {
          targetObj.links = targetObj.actionLinkList;
          delete targetObj.actionLinkList;
        }
      }

      startTransition(() => {
        setProjectData(newData);
      });
    }
  };

  const handleBatchEdit = () => {
    if (!selectedObject || selectedActionIds.size === 0) return;

    try {
      const newData = JSON.parse(JSON.stringify(projectData));
      let currentObjects = newData;
      for (const key of objectsPath) {
        currentObjects = currentObjects[key];
      }
      
      const findObj = (root: any, id: number): any => {
        if (Array.isArray(root)) {
          for (const item of root) {
            const res = findObj(item, id);
            if (res) return res;
          }
        } else if (root && typeof root === 'object') {
          if (root.id === id && !root.folder) return root;
          const keysToTraverse = ['objectList', 'children'];
          for (const key of keysToTraverse) {
            if (Array.isArray(root[key])) {
              const res = findObj(root[key], id);
              if (res) return res;
            }
          }
        }
        return null;
      };

      const targetObj = findObj(currentObjects, selectedObjectId);
      if (!targetObj) throw new Error("Object not found in cloned data");

      const targetActions = targetObj.actionList || targetObj.actions;
      
      selectedActionIds.forEach(id => {
        const action = (targetActions || []).find((a: any) => a.id === id);
        if (action) {
          if (batchNamePrefix || batchNameSuffix) {
            action.name = `${batchNamePrefix}${action.name}${batchNameSuffix}`;
          }
          if (batchColor) {
            action.r = batchColor.r;
            action.g = batchColor.g;
            action.b = batchColor.b;
            action.a = batchColor.a;
          }
        }
      });

      setProjectData(newData);
      setShowBatchEdit(false);
      setStatusMessage({ type: 'success', text: `成功批量修改了 ${selectedActionIds.size} 个行动框！` });
    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: '批量修改过程中发生错误。' });
    }
  };

  const handleDuplicate = () => {
    if (!selectedObject || selectedActionIds.size === 0) return;

    try {
      const newData = JSON.parse(JSON.stringify(projectData));
      let currentObjects = newData;
      for (const key of objectsPath) {
        currentObjects = currentObjects[key];
      }
      
      const findObj = (root: any, id: number): any => {
        if (Array.isArray(root)) {
          for (const item of root) {
            const res = findObj(item, id);
            if (res) return res;
          }
        } else if (root && typeof root === 'object') {
          if (root.id === id && !root.folder) return root;
          const keysToTraverse = ['objectList', 'children'];
          for (const key of keysToTraverse) {
            if (Array.isArray(root[key])) {
              const res = findObj(root[key], id);
              if (res) return res;
            }
          }
        }
        return null;
      };

      const targetObj = findObj(currentObjects, selectedObjectId);
      if (!targetObj) throw new Error("Object not found in cloned data");

      const targetActions = targetObj.actionList || targetObj.actions;
      const targetLinks = targetObj.actionLinkList || targetObj.links;

      let maxActionId = targetActions.reduce((max: number, a: any) => Math.max(max, a.id || 0), 0);
      let maxLinkId = targetLinks ? targetLinks.reduce((max: number, l: any) => Math.max(max, l.id || 0), 0) : 0;

      let totalCopiedActions = 0;
      let totalCopiedLinks = 0;

      for (let i = 0; i < duplicateCount; i++) {
        const idMapping: Record<number, number> = {};
        const newActions: any[] = [];

        // 1. Copy Actions
        selectedActionIds.forEach(id => {
          const original = (targetActions || []).find((a: any) => a.id === id);
          if (original) {
            const copy = JSON.parse(JSON.stringify(original));
            maxActionId++;
            idMapping[id] = maxActionId;
            
            copy.id = maxActionId;
            copy.name = `${copy.name} (副本 ${i + 1})`;
            
            // Offset position so they don't overlap exactly
            // PGMMV uses x and y for the main action box
            const currentOffsetX = (i + 1) * offsetX;
            const currentOffsetY = (i + 1) * offsetY;
            
            if (copy.x !== undefined) copy.x += currentOffsetX;
            if (copy.y !== undefined) copy.y += currentOffsetY;
            
            // Offset shortcut boxes (the dashed boxes in the screenshot)
            if (Array.isArray(copy.shortcutList)) {
              copy.shortcutList.forEach((shortcut: any) => {
                if (shortcut && shortcut.x !== undefined) shortcut.x += currentOffsetX;
                if (shortcut && shortcut.y !== undefined) shortcut.y += currentOffsetY;
              });
            }

            newActions.push(copy);
            totalCopiedActions++;
          }
        });

        if (targetObj.actionList) {
          targetObj.actionList.push(...newActions);
        } else {
          targetObj.actions.push(...newActions);
        }

        // 2. Copy Links (if requested and links exist)
        if (duplicateLinks && targetLinks) {
          const newLinks: any[] = [];
          targetLinks.forEach((link: any) => {
            // PGMMV links use typeIdPair: [[0, sourceId, ...], [0, targetId, ...]]
            // Or fallback to actionId/targetActionId for other structures
            const sourceId = link.typeIdPair ? link.typeIdPair[0][1] : link.actionId;
            const targetId = link.typeIdPair ? link.typeIdPair[1][1] : link.targetActionId;

            // Only duplicate the link if BOTH source and target are in our selection
            if (idMapping[sourceId] && idMapping[targetId]) {
              const linkCopy = JSON.parse(JSON.stringify(link));
              maxLinkId++;
              linkCopy.id = maxLinkId;
              
              if (linkCopy.typeIdPair) {
                linkCopy.typeIdPair[0][1] = idMapping[sourceId];
                linkCopy.typeIdPair[1][1] = idMapping[targetId];
              } else {
                linkCopy.actionId = idMapping[sourceId];
                linkCopy.targetActionId = idMapping[targetId];
              }
              
              // Offset link coordinates (the red arrows)
              const currentOffsetX = (i + 1) * offsetX;
              const currentOffsetY = (i + 1) * offsetY;
              if (Array.isArray(linkCopy.coordList)) {
                linkCopy.coordList.forEach((coord: number[]) => {
                  if (coord.length >= 2) {
                    coord[0] += currentOffsetX;
                    coord[1] += currentOffsetY;
                  }
                });
              }
              
              newLinks.push(linkCopy);
              totalCopiedLinks++;
            }
          });
          
          if (targetObj.actionLinkList) {
            targetObj.actionLinkList.push(...newLinks);
          } else {
            targetObj.links.push(...newLinks);
          }
        }
      }

      setProjectData(newData);
      setSelectedActionIds(new Set());
      setStatusMessage({ 
        type: 'success', 
        text: `成功复制了 ${totalCopiedActions} 个行动框 和 ${totalCopiedLinks} 条连线！` 
      });

    } catch (err) {
      console.error(err);
      setStatusMessage({ type: 'error', text: '复制过程中发生错误。' });
    }
  };

  const handleDownload = () => {
    if (!projectData) return;
    
    // 1. Create a clean copy for export (deep clone once here is fine)
    const exportData = JSON.parse(JSON.stringify(projectData));
    
    // 2. Recursively strip editor-only metadata (_editorGroups)
    // This prevents engine compatibility issues and keeps file size original.
    const stripEditorData = (data: any) => {
      if (!data || typeof data !== 'object') return;
      if (data._editorGroups) delete data._editorGroups;
      
      for (const key in data) {
        if (Array.isArray(data[key])) {
          data[key].forEach(stripEditorData);
        } else if (data[key] && typeof data[key] === 'object') {
          stripEditorData(data[key]);
        }
      }
    };
    stripEditorData(exportData);

    // 3. Export WITHOUT indentation to minimize file size (original size)
    const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.replace('.pgmmv', '_modified.pgmmv').replace('.json', '_modified.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMessage({ type: 'success', text: '文件已开始下载！已自动清理编辑器元数据并压缩体积。' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 font-sans selection:bg-blue-500/30 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Copy className="w-6 h-6 text-blue-400" />
            PGMMV 对象行动蓝图编辑器
          </h1>
          <p className="text-sm text-slate-400 mt-1">批量框选、复制行动框与连线，告别重复劳动</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer transition-colors border border-slate-700">
            <Upload className="w-4 h-4" />
            <span>上传 project.json / .pgmmv</span>
            <input 
              type="file" 
              accept=".json,.pgmmv" 
              className="hidden" 
              onChange={handleFileUpload}
              ref={fileInputRef}
            />
          </label>
          {projectData && (
            <div className="flex items-center gap-2">
              <button 
                onClick={handleClearProject}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors border border-slate-700"
                title="清除当前项目"
              >
                <Trash2 className="w-4 h-4" />
                <span>清除</span>
              </button>
              <button 
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-900/20"
              >
                <Download className="w-4 h-4" />
                <span>下载项目</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Status Bar */}
      {statusMessage && (
        <div className={cn(
          "px-6 py-3 text-sm flex items-center gap-2 border-b",
          statusMessage.type === 'success' ? "bg-emerald-950/50 text-emerald-400 border-emerald-900/50" :
          statusMessage.type === 'error' ? "bg-rose-950/50 text-rose-400 border-rose-900/50" :
          "bg-blue-950/50 text-blue-400 border-blue-900/50"
        )}>
          <AlertCircle className="w-4 h-4" />
          {statusMessage.text}
        </div>
      )}

      {/* Processing Overlay */}
      {isPending && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-[9999] flex items-center justify-center pointer-events-none">
          <div className="bg-slate-900 border border-slate-700 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-white">正在处理大型数据...</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      {!projectData ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-800 shadow-xl">
            <Copy className="w-10 h-10 text-slate-500" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">欢迎使用蓝图编辑器</h2>
          <p className="text-slate-400 max-w-md mb-8 leading-relaxed">
            这个工具可以帮你一键批量复制 PGMMV 中的行动框（Action）和连线（Link）。<br/>
            再也不用手动一个个新建、调参数了！
          </p>
          <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-4 text-amber-200/80 text-sm max-w-md text-left">
            <strong className="text-amber-400 block mb-1">⚠️ 使用前必读：</strong>
            1. 请务必先备份你的游戏工程文件夹！<br/>
            2. 点击右上角上传你的 <code>project.json</code> 或 <code>.pgmmv</code> 文件。<br/>
            3. 修改完成后下载，并覆盖原文件。
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Objects */}
          <div className="w-80 bg-slate-900/50 border-r border-slate-800 flex flex-col">
            <div className="p-4 border-b border-slate-800 font-medium text-white flex items-center justify-between">
              <span>选择对象 ({objects.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {objects.map((obj: any) => (
                <button
                  key={obj.id}
                  onClick={() => {
                    setSelectedObjectId(obj.id);
                    setSelectedActionIds(new Set());
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md text-sm transition-colors truncate",
                    selectedObjectId === obj.id 
                      ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" 
                      : "hover:bg-slate-800 text-slate-400 border border-transparent"
                  )}
                >
                  <span className="text-slate-500 mr-2">#{obj.id}</span>
                  {obj.name || '未命名对象'}
                </button>
              ))}
            </div>
          </div>

          {/* Middle: Actions List */}
          <div className="flex-1 flex flex-col bg-slate-950">
            {selectedObject ? (
              <>
                <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/30">
                  <div className="flex items-center gap-4">
                    <h2 className="font-medium text-white text-lg">
                      {selectedObject.name} <span className="text-slate-500 text-sm font-normal ml-2">({actions.length} 个行动框)</span>
                    </h2>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setShowBlueprint(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/30 hover:text-indigo-300 rounded-lg transition-colors border border-indigo-500/30 font-medium text-sm"
                    >
                      <Map className="w-4 h-4" />
                      蓝图全览 (Blueprint View)
                    </button>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input 
                        type="text" 
                        placeholder="搜索行动框..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-md pl-9 pr-4 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors w-64"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 border-b border-slate-800/50 flex items-center gap-3 bg-slate-900/10">
                  <button onClick={selectAll} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">全选</button>
                  <span className="text-slate-700">|</span>
                  <button onClick={deselectAll} className="text-sm text-slate-400 hover:text-slate-300 transition-colors">取消全选</button>
                  <span className="text-slate-700">|</span>
                  <button 
                    onClick={() => setShowBatchEdit(true)} 
                    disabled={selectedActionIds.size === 0}
                    className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    批量编辑
                  </button>
                  <span className="text-sm text-slate-500 ml-auto">已选择 {selectedActionIds.size} 个</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredActions.map((action: any) => {
                      const isSelected = selectedActionIds.has(action.id);
                      return (
                        <div 
                          key={action.id}
                          onClick={() => toggleActionSelection(action.id)}
                          className={cn(
                            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200",
                            isSelected 
                              ? "bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]" 
                              : "bg-slate-900/50 border-slate-800 hover:border-slate-600 hover:bg-slate-800/50"
                          )}
                        >
                          <div className="mt-0.5">
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5 text-blue-500" />
                            ) : (
                              <Square className="w-5 h-5 text-slate-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-slate-200 truncate" title={action.name}>{action.name || '未命名'}</div>
                            <div className="text-xs text-slate-500 mt-1 font-mono">ID: {action.id}</div>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewActionId(action.id);
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-md transition-colors"
                            title="预览行动框细节"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedActionIds(new Set([action.id]));
                              setBlueprintFocusId(action.id);
                              setShowBlueprint(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded-md transition-colors"
                            title="在蓝图中定位"
                          >
                            <Map className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                    {filteredActions.length === 0 && (
                      <div className="col-span-full py-12 text-center text-slate-500">
                        没有找到匹配的行动框
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500">
                请在左侧选择一个对象
              </div>
            )}
          </div>

          {/* Right Sidebar: Controls */}
          {selectedObject && (
            <div className="w-80 bg-slate-900/80 border-l border-slate-800 p-6 flex flex-col">
              <h3 className="text-lg font-medium text-white mb-6 flex items-center gap-2">
                <Settings className="w-5 h-5 text-slate-400" />
                复制设置
              </h3>

              <div className="space-y-6 flex-1">
                {/* Duplicate Count */}
                <div className="space-y-2">
                  <label className="text-sm text-slate-400 block">复制份数</label>
                  <div className="flex items-center gap-3">
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      value={duplicateCount}
                      onChange={(e) => setDuplicateCount(parseInt(e.target.value))}
                      className="flex-1 accent-blue-500"
                    />
                    <span className="text-white font-mono bg-slate-800 px-2 py-1 rounded text-sm min-w-[2.5rem] text-center">
                      {duplicateCount}
                    </span>
                  </div>
                </div>

                {/* Offset Settings */}
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <div className="space-y-2">
                    <label className="text-sm text-slate-400 block">X轴偏移量 (像素)</label>
                    <input 
                      type="number" 
                      value={offsetX}
                      onChange={(e) => setOffsetX(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-500">正数向右，负数向左</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm text-slate-400 block">Y轴偏移量 (像素)</label>
                    <input 
                      type="number" 
                      value={offsetY}
                      onChange={(e) => setOffsetY(parseInt(e.target.value) || 0)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-500">正数向下，负数向上</p>
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3 pt-4 border-t border-slate-800">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="mt-0.5">
                      {duplicateLinks ? (
                        <CheckSquare className="w-5 h-5 text-blue-500" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-600 group-hover:text-slate-500" />
                      )}
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={duplicateLinks}
                      onChange={(e) => setDuplicateLinks(e.target.checked)}
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-200">同时复制内部连线</div>
                      <div className="text-xs text-slate-500 mt-1 leading-relaxed">
                        如果选中的行动框之间存在连线，将一并复制这些连线逻辑。这对于复制整个状态机（蓝图）非常有用。
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-6 border-t border-slate-800">
                <button
                  onClick={handleDuplicate}
                  disabled={selectedActionIds.size === 0}
                  className={cn(
                    "w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all",
                    selectedActionIds.size > 0
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20"
                      : "bg-slate-800 text-slate-500 cursor-not-allowed"
                  )}
                >
                  <Copy className="w-5 h-5" />
                  执行批量复制
                </button>
                {selectedActionIds.size === 0 && (
                  <p className="text-xs text-center text-slate-500 mt-3">请先在左侧勾选需要复制的行动框</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Batch Edit Modal */}
      {showBatchEdit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                批量编辑行动框
              </h3>
              <button onClick={() => setShowBatchEdit(false)} className="p-1 text-slate-400 hover:text-white rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">名称修改</label>
                <div className="grid grid-cols-2 gap-2">
                  <input 
                    type="text" 
                    placeholder="前缀" 
                    value={batchNamePrefix}
                    onChange={(e) => setBatchNamePrefix(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                  <input 
                    type="text" 
                    placeholder="后缀" 
                    value={batchNameSuffix}
                    onChange={(e) => setBatchNameSuffix(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-500 uppercase font-bold tracking-wider">颜色修改</label>
                <div className="grid grid-cols-4 gap-2">
                  {['#2a2a2a', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'].map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        const r = parseInt(c.slice(1, 3), 16) || 42;
                        const g = parseInt(c.slice(3, 5), 16) || 42;
                        const b = parseInt(c.slice(5, 7), 16) || 42;
                        setBatchColor({ r, g, b, a: 255 });
                      }}
                      className="h-8 rounded border border-slate-700 hover:scale-105 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowBatchEdit(false)}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={handleBatchEdit}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium"
                >
                  确认修改
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Preview Modal */}
      {previewActionId !== null && (() => {
        const action = (actions || []).find((a: any) => a.id === previewActionId);
        if (!action) return null;

        const allLinks = selectedObject?.actionLinkList || selectedObject?.links || [];
        const outgoingLinks = allLinks.filter((l: any) => {
          const sourceId = l.typeIdPair ? l.typeIdPair[0][1] : l.actionId;
          return sourceId === previewActionId;
        });
        const incomingLinks = allLinks.filter((l: any) => {
          const targetId = l.typeIdPair ? l.typeIdPair[1][1] : l.targetActionId;
          return targetId === previewActionId;
        });

        const getActionName = (id: number) => {
          const a = (actions || []).find((act: any) => act.id === id);
          return a ? a.name : `Unknown (ID: ${id})`;
        };

        const execList = action.actionExecList || action.execList || [];

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                    <Activity className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{action.name || '未命名'}</h3>
                    <p className="text-xs text-slate-400 font-mono">Action ID: {action.id}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setPreviewActionId(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                
                {/* Flow: Incoming -> This -> Outgoing */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-slate-500" />
                    执行流程 (Flow)
                  </h4>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 overflow-x-auto custom-scrollbar">
                    <div className="min-w-max flex items-center justify-center gap-12 py-4">
                      
                      {/* INCOMING COLUMN */}
                      <div className="flex flex-col gap-4 relative">
                        {incomingLinks.map((l: any, idx: number) => {
                          const sourceId = l.typeIdPair ? l.typeIdPair[0][1] : l.actionId;
                          return (
                            <div key={idx} className="relative group">
                              <div className="h-[44px] px-4 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 shadow-sm w-40 relative z-10 hover:border-slate-500 transition-colors" title={getActionName(sourceId)}>
                                <span className="truncate">{getActionName(sourceId)}</span>
                              </div>
                              {/* Line pointing right */}
                              <div className="absolute top-1/2 -right-12 w-12 h-[2px] bg-slate-700 -translate-y-1/2 z-0"></div>
                            </div>
                          );
                        })}
                        {incomingLinks.length === 0 && (
                          <div className="h-[44px] px-4 flex items-center justify-center bg-slate-900/50 border border-slate-800 border-dashed rounded-lg text-sm text-slate-600 w-40">
                            无前置节点
                          </div>
                        )}
                        {/* Vertical connecting line for incoming */}
                        {incomingLinks.length > 1 && (
                          <div className="absolute -right-12 top-1/2 -translate-y-1/2 w-[2px] bg-slate-700" 
                               style={{ height: `calc(100% - 44px)` }}></div>
                        )}
                      </div>

                      {/* CURRENT NODE */}
                      <div className="relative z-10 flex items-center">
                        {/* Incoming arrow head */}
                        {incomingLinks.length > 0 && (
                          <div className="absolute -left-3 top-1/2 -translate-y-1/2 text-slate-700 z-20">
                            <ArrowRight className="w-5 h-5" />
                          </div>
                        )}
                        
                        <div className="px-6 py-4 bg-blue-600/20 border-2 border-blue-500 rounded-xl text-base font-bold text-blue-100 shadow-[0_0_30px_rgba(59,130,246,0.2)] w-48 text-center break-words relative z-10">
                          {action.name}
                        </div>

                        {/* Outgoing line start */}
                        {outgoingLinks.length > 0 && (
                          <div className="absolute -right-12 top-1/2 w-12 h-[2px] bg-slate-700 -translate-y-1/2 z-0"></div>
                        )}
                      </div>

                      {/* OUTGOING COLUMN */}
                      <div className="flex flex-col gap-4 relative">
                        {/* Vertical connecting line for outgoing */}
                        {outgoingLinks.length > 1 && (
                          <div className="absolute -left-12 top-1/2 -translate-y-1/2 w-[2px] bg-slate-700" 
                               style={{ height: `calc(100% - 44px)` }}></div>
                        )}
                        {outgoingLinks.map((l: any, idx: number) => {
                          const targetId = l.typeIdPair ? l.typeIdPair[1][1] : l.targetActionId;
                          return (
                            <div key={idx} className="relative group">
                              {/* Line pointing right with arrow */}
                              <div className="absolute top-1/2 -left-12 w-12 h-[2px] bg-slate-700 -translate-y-1/2 z-0">
                                <ArrowRight className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-700" />
                              </div>
                              <div className="h-[44px] px-4 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 shadow-sm w-40 relative z-10 hover:border-slate-500 transition-colors" title={getActionName(targetId)}>
                                <span className="truncate">{getActionName(targetId)}</span>
                              </div>
                            </div>
                          );
                        })}
                        {outgoingLinks.length === 0 && (
                          <div className="h-[44px] px-4 flex items-center justify-center bg-slate-900/50 border border-slate-800 border-dashed rounded-lg text-sm text-slate-600 w-40">
                            无后续节点
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                </div>

                {/* Components / Executions */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-slate-500" />
                    内部组件 (Components: {execList.length})
                  </h4>
                  {execList.length > 0 ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg divide-y divide-slate-800/50">
                      {execList.map((exec: any, idx: number) => (
                        <div key={idx} className="p-3 flex items-start gap-3 hover:bg-slate-900/50 transition-colors">
                          <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs text-slate-500 font-mono shrink-0">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-slate-200">
                              类型 (Type): <span className="text-blue-400 font-mono">{exec.actionType ?? exec.type ?? 'Unknown'}</span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 truncate">
                              {JSON.stringify(exec).substring(0, 100)}...
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-center text-sm text-slate-500">
                      该行动框内部没有执行组件 (Empty action box)
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {/* Blueprint Full View Modal */}
      {showBlueprint && selectedObject && (
        <BlueprintViewer 
          actions={actions} 
          selectedObject={selectedObject} 
          selectedActions={selectedActionIds} 
          setSelectedActions={setSelectedActionIds} 
          blueprintFocusId={blueprintFocusId}
          setBlueprintFocusId={setBlueprintFocusId}
          onClose={() => {
            setShowBlueprint(false);
            setBlueprintFocusId(null);
          }}
          onDuplicate={handleDuplicate}
          onUpdateActionPositions={handleUpdateActionPositions}
          onUpdateObjectData={handleUpdateObjectData}
        />
      )}
    </div>
  );
}
