/** Plain metadata exchanged by the type service; no Tsugiori runtime identity is required. */
export type ActionContract = Readonly<{
  uses: string;
  /** Annotation for the pinned action reference; never used to resolve or execute it. */
  originalRef?: string;
  name: string;
  description: string;
  author?: string;
  branding?: Readonly<{ icon?: string; color?: string }>;
  inputs?: Readonly<Record<string, ActionContractInput>>;
  outputs?: Readonly<Record<string, ActionContractOutput>>;
}>;

export type ActionContractInput = Readonly<{
  description: string;
  required?: boolean;
  default?: string | number | boolean | null;
  deprecationMessage?: string;
}>;

export type ActionContractOutput = Readonly<{
  description: string;
  value?: string;
}>;
