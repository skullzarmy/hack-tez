import { useAvatarSrc } from "../../lib/avatarUrl";
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
    const { src, onError } = useAvatarSrc(label, size);

    if (src) {
        return (
            <img
                src={src}
                alt={`${label} avatar`}
                onError={onError}
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
