import type { ServiceCache } from "../src/service.ts";

export const shaA = "a".repeat(40);
export const shaB = "b".repeat(40);
export const yaml = `name: Publish
description: Publish artifacts
author: Acme
branding:
  icon: upload
  color: blue
inputs:
  destination:
    description: Publish destination.
    required: true
  mode:
    description: Publish mode.
    required: true
    default: ''
    deprecationMessage: Use destination instead.
  count:
    description: Scalar default.
    required: true
    default: 1
  empty:
    description: Empty default.
    required: true
    default:
  flag:
    description: Boolean default.
    default: false
outputs:
  url:
    description: Published URL.
    value: '\${{ steps.publish.outputs.url }}'
runs:
  using: composite
  steps: []
`;

export class MemoryCache implements ServiceCache {
  now = 0;
  readonly entries = new Map<string, { until: number; response: Response }>();
  match(request: RequestInfo | URL): Promise<Response | undefined> {
    const key = new Request(request).url;
    const entry = this.entries.get(key);
    return Promise.resolve(
      entry && entry.until > this.now ? entry.response.clone() : undefined,
    );
  }
  put(request: RequestInfo | URL, response: Response): Promise<void> {
    const ttl = Number(
      response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 0,
    );
    this.entries.set(new Request(request).url, {
      until: this.now + ttl,
      response: response.clone(),
    });
    return Promise.resolve();
  }
}
