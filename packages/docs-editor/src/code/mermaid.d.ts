/** The part of Mermaid the code blocks draw with; its own declarations bring all of d3's in. */
declare module 'mermaid/dist/mermaid.core.mjs' {
  interface MermaidApi {
    initialize(config: { startOnLoad: boolean; securityLevel: 'strict'; theme: 'dark' | 'default' }): void;
    render(id: string, source: string): Promise<{ svg: string }>;
  }
  const mermaid: MermaidApi;
  export default mermaid;
}
