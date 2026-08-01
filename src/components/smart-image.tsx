import Image from "next/image";

/* eslint-disable @next/next/no-img-element */
export function SmartImage({
  src,
  alt,
  fill,
  className,
  sizes
}: {
  src: string;
  alt: string;
  fill?: boolean;
  className?: string;
  sizes?: string;
}) {
  const isRemote = /^https?:\/\//i.test(src);
  if (isRemote) {
    const imageClassName = fill
      ? `absolute inset-0 h-full w-full ${className ?? ""}`.trim()
      : className;
    return <img src={src} alt={alt} className={imageClassName} referrerPolicy="no-referrer" />;
  }
  return <Image src={src} alt={alt} fill={fill} className={className} sizes={sizes} />;
}
