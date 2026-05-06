import React from "react";

const variants = {
  default: "bg-gray-950 text-white hover:bg-gray-800 disabled:bg-gray-300",
  secondary: "bg-gray-100 text-gray-950 hover:bg-gray-200 disabled:bg-gray-100 disabled:text-gray-400",
};

export function Button({
  className = "",
  variant = "default",
  type = "button",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={`rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed ${variants[variant] || variants.default} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
