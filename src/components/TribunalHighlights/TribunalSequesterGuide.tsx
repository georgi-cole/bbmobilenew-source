import SeasonTutorialTour, { type TutorialStep } from '../../onboarding/SeasonTutorialTour'
import '../../onboarding/SeasonStartOnboardingController.css'

const SEQUESTER_STEPS: readonly TutorialStep[] = [
  {
    id: 'tribunal-recap',
    title: 'Welcome to sequester',
    body: 'Follow the Hub from your Tribunal seat, then help choose the winner. Eligible Battle Back opportunities still take you to the live show.',
    selector: '.tribunal-highlights__screen',
    padding: 3,
    shape: 'panel',
  },
  {
    id: 'tribunal-play',
    title: 'Play at your pace',
    body: 'Play moves through each recap scene, then continues to the next elimination. At Final Two, it opens your Tribunal vote.',
    selector: '.tribunal-highlights__dock [data-onboarding-target="play"]',
    padding: 3,
    shape: 'circle',
  },
  {
    id: 'tribunal-final-vote',
    title: 'Go to final vote',
    body: 'Skip the remaining highlights here. You will be asked to confirm first. Eligible return opportunities still interrupt the skip.',
    selector: '.tribunal-highlights__dock .game-control-dock__presentation-action--left',
    padding: 3,
    shape: 'rounded',
  },
  {
    id: 'tribunal-full-season',
    title: 'Watch full season',
    body: 'Switch to the full show from this point. Return to highlights using the scales beside Music. They glimmer once to show you where to find them.',
    selector: '.tribunal-highlights__dock .game-control-dock__presentation-action--right',
    padding: 3,
    shape: 'rounded',
  },
]

export default function TribunalSequesterGuide({ onClose }: { onClose: () => void }) {
  return (
    <SeasonTutorialTour
      showPublicStep={false}
      steps={SEQUESTER_STEPS}
      completeLabel="Continue watching"
      trapFocus
      onComplete={onClose}
      onSkip={onClose}
    />
  )
}
