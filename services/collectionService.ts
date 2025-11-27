
import { CollectionNode } from '../types';

const STORAGE_KEY = 'comfyui_collections_v1';

class CollectionService {
  private collections: CollectionNode[];

  constructor() {
    this.collections = this.load();
    if (this.collections.length === 0) {
        // Init with a default folder
        this.addNode({
            id: 'default-folder',
            name: '默认收藏 (Default)',
            type: 'folder',
            children: [],
            createdAt: Date.now(),
            isOpen: true
        });
    }
  }

  private load(): CollectionNode[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to load collections', e);
      return [];
    }
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.collections));
  }

  public getCollections(): CollectionNode[] {
    return [...this.collections];
  }

  public addNode(node: CollectionNode, parentId?: string) {
    if (!parentId) {
      this.collections.push(node);
    } else {
      const parent = this.findNode(this.collections, parentId);
      if (parent && parent.type === 'folder') {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
        parent.isOpen = true; // Auto open when adding
      }
    }
    this.save();
    return this.getCollections();
  }

  public deleteNode(id: string) {
    this.collections = this.deleteNodeRecursive(this.collections, id);
    this.save();
    return this.getCollections();
  }

  public toggleFolder(id: string) {
      const node = this.findNode(this.collections, id);
      if (node && node.type === 'folder') {
          node.isOpen = !node.isOpen;
          this.save();
      }
      return this.getCollections();
  }

  private findNode(nodes: CollectionNode[], id: string): CollectionNode | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = this.findNode(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  private deleteNodeRecursive(nodes: CollectionNode[], id: string): CollectionNode[] {
    return nodes.filter(node => {
      if (node.id === id) return false;
      if (node.children) {
        node.children = this.deleteNodeRecursive(node.children, id);
      }
      return true;
    });
  }
  
  // Flatten folders for selection dropdown
  public getAllFolders(): CollectionNode[] {
      const folders: CollectionNode[] = [];
      const traverse = (nodes: CollectionNode[]) => {
          nodes.forEach(node => {
              if (node.type === 'folder') {
                  folders.push(node);
                  if (node.children) traverse(node.children);
              }
          });
      };
      traverse(this.collections);
      return folders;
  }
}

export const collectionService = new CollectionService();
