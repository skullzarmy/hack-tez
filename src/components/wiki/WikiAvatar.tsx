import { useAvatarSrc } from "../../lib/avatarUrl";
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

