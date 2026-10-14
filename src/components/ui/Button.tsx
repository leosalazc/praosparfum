import React from "react";
import { motion, HTMLMotionProps } from "motion/react";
import { LucideIcon } from "lucide-react";

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  iconPosition = "right",
  className = "",
  children,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium transition-all duration-300 ease-out focus:outline-none disabled:opacity-50 disabled:pointer-events-none rounded-full";
  const variants = {
    primary:
      "bg-mustard-500 text-white hover:bg-mustard-600 hover:shadow-lg hover:shadow-mustard-500/20",
    secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
    outline:
      "border border-neutral-200 bg-transparent hover:border-mustard-500 hover:text-mustard-600 text-neutral-900 hover:bg-mustard-50/50",
    ghost: "bg-transparent text-neutral-600 hover:text-mustard-500",
  };
  const sizes = {
    sm: "text-xs px-5 py-2.5 uppercase tracking-wider",
    md: "text-sm px-8 py-3.5 uppercase tracking-wider",
    lg: "text-base px-10 py-4 uppercase tracking-wider",
  };
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && iconPosition === "left" && <Icon className="w-4 h-4 mr-2" />}
      {children}
      {Icon && iconPosition === "right" && <Icon className="w-4 h-4 ml-2" />}
    </motion.button>
  );
}
