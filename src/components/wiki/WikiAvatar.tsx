import { useState } from "react";
import { Hackatar } from "../Hackatar";

interface WikiAvatarProps {
  label: string;
  size: number;
  animated?: boolean;
  hoverAnimate?: boolean;
  playing?: boolean;
  borderRadius?: string;
}

/**
 * Wiki avatar: resolves profile picture or gravatar via /api/v1/avatar/:label,
 * falls back to deterministic Hackatar on error. Decoupled from chat.
 */
export default function WikiAvatar({
  label,
  size,
  animated = false,
  hoverAnimate,
  playing,
  borderRadius = "50%",
}: WikiAvatarProps) {
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

