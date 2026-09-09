// The shared answer of the tools only the Enterprise edition serves.
//
// A uniform, explanatory result lets an agent recognise "not on this edition"
// and pivot to the platform tools, rather than treating it as an opaque failure.

export interface EditionUnavailableResult {
  available: false
  projectId: string
  reason:    string
}

/** The install runs the Community edition, so these tools have nothing to answer from. */
export function enterpriseToolUnavailable(projectId: string): EditionUnavailableResult {
  return {
    available: false,
    projectId,
    reason:
      'This install runs the Community edition, without the Enterprise formal engine: get_model, ' +
      'get_view, find_inconsistencies, apply_rule and generate_artifact do not apply here. Use the ' +
      'behavior tools (get_behavior_context, get_behavior_feature, assess_behavior_feature, ' +
      'score_behavior_feature) and the experience tools (get_experience_coverage, ' +
      'verify_experience, simulate_experience) instead; they run on the platform.',
  }
}
