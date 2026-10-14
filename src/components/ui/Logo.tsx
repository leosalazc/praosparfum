export function Logo({ className = "w-40" }: { className?: string }) {
  return (
    <img src="/logo.webp" alt="Práos Parfum" width={400} height={177} className={`object-contain ${className}`} />
  );
}
