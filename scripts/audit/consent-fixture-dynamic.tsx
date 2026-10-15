import * as React from "react";

// The fixture has no Next router. Preserve the actual component's deferred
// import and Suspense fallback while adapting only next/dynamic's wrapper.
export default function dynamic<Props extends object>(load: () => Promise<React.ComponentType<Props>>, options: { loading?: React.ComponentType }) {
  const Component = React.lazy(async () => ({ default: await load() }));
  const Loading = options.loading;
  return function FixtureDynamic(props: Props) {
    return <React.Suspense fallback={Loading ? <Loading /> : null}><Component {...props} /></React.Suspense>;
  };
}
