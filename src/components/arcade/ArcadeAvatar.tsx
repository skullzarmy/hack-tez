import { useAvatarSrc } from "../../lib/avatarUrl";
import { Hackatar } from "../Hackatar";

interface ArcadeAvatarProps {
    label: string;
    size: number;
}

/**
 * Profile-aware avatar for arcade: tries /api/v1/avatar/:label first
 * (profile picture → gravatar → hackatar), falls back to <Hackatar>
 * on error.
 */
export default function ArcadeAvatar({ label, size }: ArcadeAvatarProps) {
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
                    borderRadius: "50%",
                    objectFit: "cover",
                    flexShrink: 0,
                    backgroundColor: "#000",
                }}
            />
        );
    }

    return <Hackatar label={label} size={size} />;
}
