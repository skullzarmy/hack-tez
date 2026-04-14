export interface MediaAttachment {
    type: "gif" | "image";
    url: string;
    width?: number;
    height?: number;
    alt?: string;
    thumbnailUrl?: string;
    provider?: string;
}

export interface ReactionCount {
    emoji: string;
    count: number;
    domains: string[];
}

export interface ChatMessage {
    id: string;
    sender: string;
    content: string | null;
    timestamp: string;
    deleted?: boolean;
    deletedBy?: string;
    deleteReason?: string;
    media?: MediaAttachment;
    replyTo?: string;
    replyContext?: { id: string; sender: string; content: string | null; deleted?: boolean };
    editedAt?: string;
    reactions?: ReactionCount[];
}
