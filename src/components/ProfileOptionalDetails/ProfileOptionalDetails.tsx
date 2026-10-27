import { useId, useState, type ReactNode, type ChangeEvent } from 'react'
import type { ProfileBio } from '../../store/profilesSlice'
import './ProfileOptionalDetails.css'

type TextKey = Exclude<keyof ProfileBio, 'age' | 'sex' | 'reproductiveProfile'>
type DetailField = {
  key: TextKey
  label: string
  maxLength: number
  placeholder?: string
  multiline?: boolean
}
const SECTIONS: { label: string; personal?: boolean; fields: DetailField[] }[] = [
  {
    label: 'About you',
    fields: [
      {
        key: 'story',
        label: 'About You',
        maxLength: 200,
        placeholder: 'A short bio or personal story',
        multiline: true,
      },
      { key: 'location', label: 'Location', maxLength: 50, placeholder: 'City, State' },
      { key: 'profession', label: 'Profession', maxLength: 50, placeholder: 'What do you do?' },
    ],
  },
  {
    label: 'Flavor / Personality',
    fields: [
      {
        key: 'motto',
        label: 'Personal Motto',
        maxLength: 80,
        placeholder: 'Your motto or catchphrase',
      },
      {
        key: 'funFact',
        label: 'Fun Fact',
        maxLength: 100,
        placeholder: 'Something surprising about you',
      },
      { key: 'zodiac', label: 'Zodiac Sign', maxLength: 20, placeholder: 'e.g. Scorpio' },
    ],
  },
  {
    label: 'Background / Family',
    fields: [
      {
        key: 'education',
        label: 'Education',
        maxLength: 60,
        placeholder: "e.g. Bachelor's in Psychology",
      },
      {
        key: 'familyStatus',
        label: 'Family Status',
        maxLength: 40,
        placeholder: 'e.g. Single, Married',
      },
      { key: 'kids', label: 'Kids', maxLength: 40, placeholder: 'e.g. Two kids, ages 5 and 8' },
      {
        key: 'pets',
        label: 'Pets',
        maxLength: 40,
        placeholder: 'e.g. Two cats named Mochi and Boba',
      },
    ],
  },
  {
    label: 'Optional / Personal',
    personal: true,
    fields: [
      { key: 'religion', label: 'Religion', maxLength: 40 },
      { key: 'sexuality', label: 'Sexuality', maxLength: 40 },
    ],
  },
]

function DetailsSection({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className="profile-details__section">
      <button
        type="button"
        className="profile-details__toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span>{label}</span>
        <span className="profile-details__chevron" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div id={id} className="profile-details__body" role="region" aria-label={`${label} fields`}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function ProfileOptionalDetails({
  value,
  onChange,
}: {
  value: ProfileBio
  onChange: (bio: ProfileBio) => void
}) {
  const id = useId()
  const reproductive = value.reproductiveProfile
  const pregnancyRole =
    reproductive?.canBecomePregnant && reproductive.canCausePregnancy
      ? 'both'
      : reproductive?.canBecomePregnant
        ? 'become'
        : reproductive?.canCausePregnancy
          ? 'cause'
          : 'none'
  return (
    <div className="profile-details">
      {SECTIONS.map((section) => (
        <DetailsSection key={section.label} label={section.label}>
          {section.personal && (
            <>
              <p className="profile-details__note">
                This information is optional and stored locally on your device.
              </p>
              <div className="profile-details__field">
                <label htmlFor={`${id}-pregnancy-role`}>Pregnancy role (optional)</label>
                <select
                  id={`${id}-pregnancy-role`}
                  value={pregnancyRole}
                  onChange={(event) => {
                    const role = event.target.value
                    onChange({
                      ...value,
                      reproductiveProfile:
                        role === 'none'
                          ? undefined
                          : {
                              canBecomePregnant: role === 'become' || role === 'both',
                              canCausePregnancy: role === 'cause' || role === 'both',
                            },
                    })
                  }}
                >
                  <option value="none">Not specified — ask me in-game when needed</option>
                  <option value="become">Can become pregnant</option>
                  <option value="cause">Can cause pregnancy</option>
                  <option value="both">Both</option>
                </select>
                <p className="profile-details__hint">
                  Used only for adult Reality pregnancy storylines. Leave unset to choose in-game
                  when needed.
                </p>
              </div>
            </>
          )}
          {section.fields.map((field) => {
            const props = {
              id: `${id}-${field.key}`,
              value: value[field.key] ?? '',
              maxLength: field.maxLength,
              placeholder: field.placeholder,
              onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                onChange({ ...value, [field.key]: event.target.value }),
            }
            return (
              <div className="profile-details__field" key={field.key}>
                <label htmlFor={props.id}>{field.label}</label>
                {field.multiline ? (
                  <textarea {...props} rows={3} />
                ) : (
                  <input {...props} type="text" />
                )}
              </div>
            )
          })}
        </DetailsSection>
      ))}
    </div>
  )
}
