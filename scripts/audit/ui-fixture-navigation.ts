const router = { push: (href: string) => { (window as any).fixtureNavigation = href; }, refresh: () => {}, replace: () => {} };
export const useRouter = () => router;
export const usePathname = () => "/synthetic-fixture";
