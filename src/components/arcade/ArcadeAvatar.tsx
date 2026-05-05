import { useState } from "react";
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
