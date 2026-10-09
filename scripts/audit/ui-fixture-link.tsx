import * as React from "react";
export default function FixtureLink({ href, prefetch: _prefetch, children, ...props }: any) {
  return <a href={href} {...props}>{children}</a>;
}
