/** Next remounts the template on navigation; no timers, route interception or data delay. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="ui-page-enter min-w-0">{children}</div>;
}
