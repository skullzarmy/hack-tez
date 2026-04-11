import { useState } from "react";
import { Hackatar } from "../Hackatar";

interface ChatAvatarProps {
    label: string;
    size: number;
    animated?: boolean;
    hoverAnimate?: boolean;
    playing?: boolean;
    borderRadius?: string;
}

/**
 * Profile-aware avatar for chat: tries /api/v1/avatar/:label first
 * (profile picture → gravatar → hackatar), falls back to <Hackatar>
 * on error — same pattern as Hackers page Avatar component.
 */
export default function ChatAvatar({
    label,
    size,
    animated = false,
    hoverAnimate,
    playing,
    borderRadius = "50%",
}: ChatAvatarProps) {
    const [imgFailed, setImgFailed] = useState(false);
    const url = `/api/v1/avatar/${encodeURIComponent(label)}`;

    if (!imgFailed) {
        return (
            <img
                src={url}
                alt={`${label} avatar`}
                onError={() => setImgFailed(true)}
                style={{
                    width: size,
                    height: size,
                    borderRadius,
                    objectFit: "cover",
                    flexShrink: 0,
                    backgroundColor: "#000",
                }}
            />
        );
    }

    return (
        <Hackatar
            label={label}
            size={size}
            animated={animated}
            hoverAnimate={hoverAnimate}
            playing={playing}
            borderRadius={borderRadius}
        />
    );
}
