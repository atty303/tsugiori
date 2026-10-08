const access = ["none", "read", "write"] as const;
export const permissionLevels = {
  "actions": access,
  "artifact-metadata": access,
  "attestations": access,
  "checks": access,
  "code-quality": access,
  "contents": access,
  "deployments": access,
  "discussions": access,
  "id-token": ["none", "write"],
  "issues": access,
  "packages": access,
  "pages": access,
  "pull-requests": access,
  "security-events": access,
  "statuses": access,
  "vulnerability-alerts": ["none", "read"],
} as const;
