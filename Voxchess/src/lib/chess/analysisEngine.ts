import { Chess } from "chess.js";

export interface TreeNode {
    id: string;
    fen: string;
    move: string | null;
    san: string | null;
    parent: TreeNode | null;
    children: TreeNode[];
    arrows: Array<{ from: string; to: string }>;
    highlights: string[];
    isMainLine: boolean;
    plyIndex: number;
}

export interface SerializedNode {
    id: string;
    fen: string;
    move: string | null;
    san: string | null;
    arrows: Array<{ from: string; to: string }>;
    highlights: string[];
    isMainLine: boolean;
    plyIndex: number;
    children: SerializedNode[];
}
function generateId() {
    return Math.random().toString(36).slice(2, 9);
}

export class AnalysisTree {
    root: TreeNode;
    current: TreeNode;

    constructor(startFen: string) {
        this.root = {
            id: generateId(),
            fen: startFen,
            move: null,
            san: null,
            parent: null,
            children: [],
            arrows: [],
            highlights: [],
            isMainLine: true,
            plyIndex: 0,
        };
        this.current = this.root;
    }

    loadMainLine(moves: string[]) {
        const chess = new Chess(this.root.fen);
        let node = this.root;

        for (let i = 0; i < moves.length; i++) {
            const result = chess.move(moves[i]);
            if (!result) break;

            const child: TreeNode = {
                id: generateId(),
                fen: chess.fen(),
                move: result.from + result.to + (result.promotion ?? ""),
                san: result.san,
                parent: node,
                children: [],
                arrows: [],
                highlights: [],
                isMainLine: true,
                plyIndex: i + 1,
            };

            node.children.push(child);
            node = child;
        }

        this.current = this.root;
    }

    // Try to make a move from current position
    // If it matches the main line child, follow it
    // Otherwise create a variation branch
    makeMove(uciMove: string): TreeNode | null {
        const chess = new Chess(this.current.fen);

        // Parse UCI move (e.g. "e2e4")
        const from = uciMove.slice(0, 2);
        const to = uciMove.slice(2, 4);
        const promotion = uciMove.slice(4) || undefined;

        let result;
        try {
            result = chess.move({ from, to, promotion });
        } catch {
            return null;
        }
        if (!result) return null;

        // Check if this move already exists as a child
        const existing = this.current.children.find((c) => c.move === result!.lan);
        if (existing) {
            this.current = existing;
            return existing;
        }

        // Create new variation node
        const newNode: TreeNode = {
            id: generateId(),
            fen: chess.fen(),
            move: result.from + result.to + (result.promotion ?? ""),
            san: result.san,
            parent: this.current,
            children: [],
            arrows: [],
            highlights: [],
            isMainLine: false,
            plyIndex: this.current.plyIndex + 1,
        };

        this.current.children.push(newNode);
        this.current = newNode;
        return newNode;
    }

    goToNode(node: TreeNode) {
        this.current = node;
    }

    next(): TreeNode | null {
        if (this.current.children.length === 0) return null;
        this.current = this.current.children[0];
        return this.current;
    }

    prev(): TreeNode | null {
        if (!this.current.parent) return null;
        this.current = this.current.parent;
        return this.current;
    }

    goToStart() {
        this.current = this.root;
        return this.root;
    }

    goToEnd() {
        let node = this.current;
        while (node.children.length > 0) {
            node = node.children[0];
        }
        this.current = node;
        return node;
    }

    goToMainLinePly(ply: number): TreeNode | null {
        // Walk main line from root
        let node = this.root;
        for (let i = 0; i < ply; i++) {
            const mainChild = node.children.find((c) => c.isMainLine);
            if (!mainChild) break;
            node = mainChild;
        }
        this.current = node;
        return node;
    }

    backToMainLine(): TreeNode {
        // Walk up until we hit a main line node
        let node = this.current;
        while (!node.isMainLine && node.parent) {
            node = node.parent;
        }
        this.current = node;
        return node;
    }

    setArrows(arrows: Array<{ from: string; to: string }>) {
        this.current.arrows = arrows;
    }

    setHighlights(highlights: string[]) {
        this.current.highlights = highlights;
    }

    getMainLinePath(): TreeNode[] {
        const path: TreeNode[] = [this.root];
        let node = this.root;
        while (node.children.length > 0) {
            const main = node.children.find((c) => c.isMainLine) ?? node.children[0];
            path.push(main);
            node = main;
        }
        return path;
    }

    getCurrentPath(): TreeNode[] {
        const path: TreeNode[] = [];
        let node: TreeNode | null = this.current;
        while (node) {
            path.unshift(node);
            node = node.parent;
        }
        return path;
    }

    serialize(): SerializedNode {
        const serializeNode = (node: TreeNode): SerializedNode => ({
            id: node.id,
            fen: node.fen,
            move: node.move,
            san: node.san,
            arrows: node.arrows,
            highlights: node.highlights,
            isMainLine: node.isMainLine,
            plyIndex: node.plyIndex,
            children: node.children.map(serializeNode),
        });
        return serializeNode(this.root);
    }

    static deserialize(data: SerializedNode, parent: TreeNode | null = null): TreeNode {
        const node: TreeNode = {
            id: data.id,
            fen: data.fen,
            move: data.move,
            san: data.san,
            parent,
            children: [],
            arrows: data.arrows ?? [],
            highlights: data.highlights ?? [],
            isMainLine: data.isMainLine,
            plyIndex: data.plyIndex,
        };
        node.children = (data.children ?? []).map((c) =>
            AnalysisTree.deserialize(c, node)
        );
        return node;
    }
}