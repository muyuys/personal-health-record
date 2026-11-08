// 页头状态：视图可声明 eyebrow/title/sub/actions，Shell 统一渲染。
// 对齐旧前端 setHead()。
import { createContext, useContext, useState, type ReactNode } from 'react';

export interface Head {
  eyebrow?: string;
  title: string;
  sub?: string;
  actions?: ReactNode;
}

interface HeadCtx {
  head: Head;
  setHead: (h: Head) => void;
}

const Ctx = createContext<HeadCtx | null>(null);

export function HeadProvider({ children }: { children: ReactNode }) {
  const [head, setHead] = useState<Head>({ title: '' });
  return <Ctx.Provider value={{ head, setHead }}>{children}</Ctx.Provider>;
}

export function useHead() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useHead must be inside HeadProvider');
  return c;
}
