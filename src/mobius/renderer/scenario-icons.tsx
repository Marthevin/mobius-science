import * as React from 'react'

import subagentIcon from '../../../mobius/generated/renderer/scenarios/subagent-64.png'
import reviewerIcon from '../../../mobius/generated/renderer/scenarios/reviewer-64.png'
import visionIcon from '../../../mobius/generated/renderer/scenarios/vision-64.png'
import sessionDetailsIcon from '../../../mobius/generated/renderer/scenarios/session-details-64.png'

export type MobiusScenarioIconId = 'subagent' | 'reviewer' | 'vision' | 'session-details'

const scenarioIcons: Readonly<Record<MobiusScenarioIconId, string>> = Object.freeze({
  subagent: subagentIcon,
  reviewer: reviewerIcon,
  vision: visionIcon,
  'session-details': sessionDetailsIcon
})

export const MobiusScenarioIcon = ({
  id,
  className
}: {
  id: MobiusScenarioIconId
  className?: string
}): React.JSX.Element => (
  <img
    src={scenarioIcons[id]}
    alt=""
    aria-hidden="true"
    draggable={false}
    data-scenario-icon={id}
    className={className}
  />
)
