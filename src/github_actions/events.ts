/** GitHub.com trigger and payload contracts at the frozen specification basis.
 * Webhook shapes come from the type-only, exact-version OpenAPI dependency.
 * Actions-specific settings and payload differences are owned here.
 * @module
 */
import type { WebhookOperations } from "../deps.ts";
import type {
  WorkflowCall,
  WorkflowDispatchInput,
  WorkflowInputValues,
} from "./mod.ts";

// Event activity lists are from the fixed events source and its transitive PR template.
export const activities = {
  branch_protection_rule: ["created", "edited", "deleted"],
  check_run: ["created", "rerequested", "completed", "requested_action"],
  check_suite: ["completed"],
  create: [],
  delete: [],
  deployment: [],
  deployment_status: [],
  discussion: [
    "created",
    "edited",
    "deleted",
    "transferred",
    "pinned",
    "unpinned",
    "labeled",
    "unlabeled",
    "locked",
    "unlocked",
    "category_changed",
    "answered",
    "unanswered",
  ],
  discussion_comment: ["created", "edited", "deleted"],
  fork: [],
  gollum: [],
  image_version: [],
  issue_comment: ["created", "edited", "deleted"],
  issues: [
    "opened",
    "edited",
    "deleted",
    "transferred",
    "pinned",
    "unpinned",
    "closed",
    "reopened",
    "assigned",
    "unassigned",
    "labeled",
    "unlabeled",
    "locked",
    "unlocked",
    "milestoned",
    "demilestoned",
    "typed",
    "untyped",
    "field_added",
    "field_removed",
  ],
  label: ["created", "edited", "deleted"],
  merge_group: ["checks_requested"],
  milestone: ["created", "closed", "opened", "edited", "deleted"],
  page_build: [],
  public: [],
  pull_request: [
    "assigned",
    "unassigned",
    "labeled",
    "unlabeled",
    "opened",
    "edited",
    "closed",
    "reopened",
    "synchronize",
    "converted_to_draft",
    "locked",
    "unlocked",
    "enqueued",
    "dequeued",
    "milestoned",
    "demilestoned",
    "ready_for_review",
    "review_requested",
    "review_request_removed",
    "auto_merge_enabled",
    "auto_merge_disabled",
  ],
  pull_request_review: ["submitted", "edited", "dismissed"],
  pull_request_review_comment: ["created", "edited", "deleted"],
  pull_request_target: [
    "assigned",
    "unassigned",
    "labeled",
    "unlabeled",
    "opened",
    "edited",
    "closed",
    "reopened",
    "synchronize",
    "converted_to_draft",
    "locked",
    "unlocked",
    "enqueued",
    "dequeued",
    "milestoned",
    "demilestoned",
    "ready_for_review",
    "review_requested",
    "review_request_removed",
    "auto_merge_enabled",
    "auto_merge_disabled",
  ],
  push: [],
  registry_package: ["published", "updated"],
  release: [
    "published",
    "unpublished",
    "created",
    "edited",
    "deleted",
    "prereleased",
    "released",
  ],
  repository_dispatch: [],
  schedule: [],
  status: [],
  watch: ["started"],
  workflow_call: [],
  workflow_dispatch: [],
  workflow_run: ["completed", "requested", "in_progress"],
} as const;

/** Native Actions event names. workflow_call is a declaration; its runtime event is inherited from the caller. */
export type WorkflowEvent = keyof typeof activities;
/** Activity names accepted for one event at the frozen GitHub.com basis. repository_dispatch has user-defined names. */
export type Activity<E extends WorkflowEvent> = E extends "repository_dispatch"
  ? string
  : typeof activities[E][number];
/** Include patterns are ordered; a ! pattern excludes a previous match. At least one positive pattern is required. */
export interface BranchFilters {
  /** Base branch patterns for PRs, merge groups and workflow_run; branch names for push. */
  readonly branches?: readonly string[];
  /** Excluded branches; cannot be combined with branches. */
  readonly "branches-ignore"?: readonly string[];
}
/** Path filters use the changed-file fixture in scenarios; branch and path filters must both match. */
export interface PathFilters {
  /** Ordered include/exclude patterns. Tag pushes ignore path filters. */
  readonly paths?: readonly string[];
  /** Run unless every changed file matches an ignore pattern; cannot be combined with paths. */
  readonly "paths-ignore"?: readonly string[];
}
/** Native push filters. With only branch filters, tag pushes do not match, and vice versa. */
export interface PushTrigger extends BranchFilters, PathFilters {
  /** Ordered tag include/exclude patterns. */ readonly tags?:
    readonly string[];
  /** Tag exclusions; cannot be combined with tags. */ readonly "tags-ignore"?:
    readonly string[];
}
/** Settings for an event with activity types. Omission accepts all documented activities, except PRs use opened/synchronize/reopened. */
export interface ActivityTrigger<E extends WorkflowEvent> {
  /** Activities that start a run. repository_dispatch names are caller-defined. */ readonly types?:
    readonly Activity<E>[];
}
/** PR filtering applies to the base branch. PR-target executes in the trusted base context; never execute untrusted PR code with its credentials. */
export interface PullRequestTrigger<
  E extends "pull_request" | "pull_request_target",
> extends ActivityTrigger<E>, BranchFilters, PathFilters {}
/** Select runs of named upstream workflows. Multiple names are alternatives; delivery and access eligibility belong to GitHub. */
export interface WorkflowRunTrigger
  extends ActivityTrigger<"workflow_run">, BranchFilters {
  /** Upstream workflow display names. */ readonly workflows: readonly string[];
}
/** One POSIX five-field schedule. GitHub runs on the default branch, can delay/drop runs, and has a minimum five-minute frequency. */
export interface Schedule {
  /** POSIX cron with *, lists, ranges and steps; named months/weekdays are supported. */ readonly cron:
    string;
  /** IANA timezone; omission uses UTC. GitHub owns DST and dispatch timing. */ readonly timezone?:
    string;
}
/** Custom runner image selection. GitHub owns image publication and event delivery. */
export interface ImageVersionTrigger {
  /** Image name glob alternatives. */ readonly names?: readonly string[];
  /** Image version glob alternatives. */ readonly versions?: readonly string[];
}
/** All native trigger settings; use {} for an event without options and an array for schedule.
 * @example
 * ```ts
 * workflow(".github/workflows/ci.yml", { on: {
 *   push: { paths: ["src/**", "!src/generated/**"] },
 *   issues: { types: ["opened"] },
 *   schedule: [{ cron: "15 4 * * MON", timezone: "Asia/Tokyo" }],
 * } });
 * ```
 */
export type WorkflowTriggers = Readonly<
  & {
    [E in Exclude<WorkflowEvent, Special>]?: typeof activities[E] extends
      readonly [] ? Record<string, never> : ActivityTrigger<E>;
  }
  & {
    /** Native push branch, tag and path filters. */ push?: PushTrigger;
    /** Pull request merge-context trigger. */ pull_request?:
      PullRequestTrigger<"pull_request">;
    /** Pull request base-context trigger. */ pull_request_target?:
      PullRequestTrigger<"pull_request_target">;
    /** Merge queue trigger; filters its target branch. */ merge_group?:
      & ActivityTrigger<"merge_group">
      & BranchFilters;
    /** Completion/request/start of an upstream workflow. */ workflow_run?:
      WorkflowRunTrigger;
    /** Image name and version filters. */ image_version?: ImageVersionTrigger;
    /** User-defined event_type names; payload is client_payload. */ repository_dispatch?:
      ActivityTrigger<"repository_dispatch">;
    /** Schedule entries; scenarios consume delivered event.schedule, not a clock. */ schedule?:
      readonly Schedule[];
    /** Manual input declarations, whose native values are available in inputs. */ workflow_dispatch?:
      Readonly<{
        /** Up to 25 inputs; total input payload is limited to 65,535 characters by GitHub. */ inputs?:
          Readonly<Record<string, WorkflowDispatchInput>>;
      }>;
    /** Reusable workflow contract. Runtime github context remains the caller's context. */ workflow_call?:
      & WorkflowCall
      & Readonly<{
        /** Maps returned output names to native job output expressions. */ outputs?:
          Readonly<
            Record<
              string,
              Readonly<{
                /** Description for callers. */ description?: string;
                /** GitHub job output expression. */ value: string;
              }>
            >
          >;
      }>;
  }
>;
type Special =
  | "push"
  | "pull_request"
  | "pull_request_target"
  | "merge_group"
  | "workflow_run"
  | "image_version"
  | "repository_dispatch"
  | "schedule"
  | "workflow_dispatch"
  | "workflow_call";
type Dash<S extends string> = S extends `${infer A}_${infer B}`
  ? `${A}-${Dash<B>}`
  : S;
type Operation<E extends string> = WebhookOperations[
  Extract<keyof WebhookOperations, Dash<E> | `${Dash<E>}/${string}`>
];
type Body<O> = O extends
  { requestBody: { content: { "application/json": infer P } } } ? P : never;
type Webhook<E extends string> = Body<Operation<E>>;
type Pr = Webhook<"pull_request">;
/** Actions omits the PR body for some merged/fork events. Fields therefore retain their absence in the payload contract. */
type PullRequestPayload = Pr extends infer P
  ? P extends { pull_request: infer R }
    ? Omit<P, "pull_request"> & { readonly pull_request?: R | null }
  : P
  : never;
type PushWebhook = Webhook<"push">;
type ActionsCommit<C> = C extends object
  ? Omit<C, "added" | "removed" | "modified">
  : C;
/** Actions excludes changed-file attributes from push commit objects. Use scenario.changedFiles for path-filter facts. */
type PushPayload = Omit<PushWebhook, "commits" | "head_commit"> & {
  /** Pushed commits without webhook-only file lists. */
  readonly commits: readonly ActionsCommit<PushWebhook["commits"][number]>[];
  /** Tip commit, or null when absent. */
  readonly head_commit: ActionsCommit<PushWebhook["head_commit"]>;
};
/** The fixed Actions source documents no image_version webhook payload. Image matching facts are separate scenario inputs; no undocumented payload fields are asserted. */
export type ImageVersionPayload = Record<never, never>;
/** Delivered schedule identifier. Its cron string selects a configured schedule; no clock is simulated. */
export interface SchedulePayload {
  /** Cron entry that GitHub delivered. */ readonly schedule: string;
}
/** Event payload at the fixed Actions basis, using the exact-version OpenAPI type source for webhook events.
 * workflow_call inherits any caller event, including caller-declared dispatch input names with string values. Actions dispatch booleans are strings in github.event.inputs.
 */
export type EventPayload<
  E extends WorkflowEvent,
  On extends WorkflowTriggers = WorkflowTriggers,
> = E extends "workflow_call"
  ? EventPayload<Exclude<WorkflowEvent, "workflow_call">, On>
  : E extends "schedule" ? SchedulePayload
  : E extends "image_version" ? ImageVersionPayload
  : E extends "workflow_dispatch" ? Omit<Webhook<E>, "inputs"> & {
      /** Declared dispatch values serialized as strings by GitHub. */
      readonly inputs: "workflow_call" extends keyof On
        ? Readonly<Record<string, string>>
        : {
          readonly [
            K in keyof WorkflowInputValues<Pick<On, "workflow_dispatch">>
          ]: string;
        };
    }
  : E extends "push" ? PushPayload
  : E extends "pull_request" | "pull_request_target" ? PullRequestPayload
  : Webhook<E>;

export declare const eventTypes: unique symbol;
export declare const eventSelection: unique symbol;
export declare const activitySelection: unique symbol;
export type WithEvents<I, On extends WorkflowTriggers> = I & {
  readonly [eventTypes]?: On;
};
export type EventsOf<I> = I extends
  { readonly [eventTypes]?: infer On extends WorkflowTriggers } ? On
  : WorkflowTriggers;
export type RuntimeEvents<On extends WorkflowTriggers> = "workflow_call" extends
  keyof On ? Exclude<WorkflowEvent, "workflow_call">
  : Extract<keyof On, Exclude<WorkflowEvent, "workflow_call">>;
export type SelectedEvents<I> = typeof eventTypes extends keyof I
  ? I extends { readonly [eventSelection]?: infer E extends WorkflowEvent } ? E
  : RuntimeEvents<EventsOf<I>>
  : string;
export type EventProof<P> = Extract<P, `event:${string}`> extends
  `event:${infer E extends WorkflowEvent}` ? E : never;
interface EventState<On extends WorkflowTriggers, E extends WorkflowEvent, A> {
  readonly [eventTypes]?: On;
  readonly [eventSelection]?: E;
  readonly [activitySelection]?: A;
}
export type NarrowEvents<I, P> = [Extract<P, `event:${string}`>] extends [never]
  ? I
  :
    & Omit<I, typeof eventSelection | typeof activitySelection>
    & EventState<
      EventsOf<I>,
      EventProof<P>,
      [Extract<P, `activity:${string}`>] extends [never] ? never
        : Extract<P, `activity:${string}`> extends `activity:${infer A}` ? A
        : never
    >;
type AllowedActivities<I, E extends WorkflowEvent> = I extends
  { readonly [activitySelection]?: infer A }
  ? [Exclude<A, undefined>] extends [never] ? TriggerActivities<I, E>
  : Exclude<A, undefined>
  : TriggerActivities<I, E>;
type TriggerActivities<I, E extends WorkflowEvent> = "workflow_call" extends
  keyof EventsOf<I> ? Activity<E>
  : EventsOf<I>[E] extends { types: readonly (infer A)[] } ? A
  : E extends "pull_request" | "pull_request_target"
    ? "opened" | "synchronize" | "reopened"
  : Activity<E>;
type ActivityPayload<P, A> = P extends { action?: infer Actual }
  ? [A] extends [never] ? P
  : Extract<A, Actual> extends never ? never
  : P & { readonly action: Extract<A, Actual> }
  : P;
export type PayloadFor<I> = typeof eventTypes extends keyof I
  ? SelectedEvents<I> extends infer E
    ? E extends WorkflowEvent
      ? ActivityPayload<EventPayload<E, EventsOf<I>>, AllowedActivities<I, E>>
    : never
  : never
  : unknown;
