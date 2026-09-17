"use client";

import * as React from "react";
import { useMotionValue, animate, useReducedMotion } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
  decimals?: number;
}

export function AnimatedCounter({
  value,
  format,
  duration = 0.25,
  className,
  decimals = 0,
}: AnimatedCounterProps) {
  const prefersReducedMotion = useReducedMotion();
  const motionVal = useMotionValue(prefersReducedMotion ? value : 0);
  const [displayValue, setDisplayValue] = React.useState<string>(() => {
    if (format) return format(value);
    return value.toLocaleString("pl-PL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  });

  const prevValueRef = React.useRef(0);

  React.useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(
        format
          ? format(value)
          : value.toLocaleString("pl-PL", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            })
      );
      return;
    }

    const startVal = prevValueRef.current;
    motionVal.set(startVal);

    const controls = animate(motionVal, value, {
      duration,
      ease: [0.16, 1, 0.3, 1], // Apple-style fluid ease-out
      onUpdate: (latest) => {
        setDisplayValue(
          format
            ? format(latest)
            : latest.toLocaleString("pl-PL", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              })
        );
      },
    });

    prevValueRef.current = value;
    return () => controls.stop();
  }, [value, duration, format, decimals, prefersReducedMotion, motionVal]);

  return <span className={className}>{displayValue}</span>;
}
