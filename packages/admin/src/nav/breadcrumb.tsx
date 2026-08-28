import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  /** 末级不带 to，渲染成纯文字 */
  to?: string;
}

const BreadcrumbContext = createContext<(trail: Crumb[]) => void>(() => undefined);
const TrailContext = createContext<Crumb[]>([]);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [trail, setTrail] = useState<Crumb[]>([]);
  return (
    <BreadcrumbContext.Provider value={setTrail}>
      <TrailContext.Provider value={trail}>{children}</TrailContext.Provider>
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumbTrail(): Crumb[] {
  return useContext(TrailContext);
}

/**
 * 页面自报面包屑。
 *
 * 层级从路由结构推不出可读的名字 —— `/users/:id/profiles` 里那个 id 要显示成
 * 用户备注，只有已经把数据取回来的页面知道。所以由页面上报，而不是在 shell
 * 里再查一遍。
 */
export function useBreadcrumb(trail: Crumb[]): void {
  const setTrail = useContext(BreadcrumbContext);
  const key = JSON.stringify(trail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => trail, [key]);

  useEffect(() => {
    setTrail(stable);
    return () => setTrail([]);
  }, [stable, setTrail]);
}
