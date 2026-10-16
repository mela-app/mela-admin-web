import type { CameraEffectKind, MakeupAudience } from '../../lib/types'

export const KIND_LABELS: Record<CameraEffectKind, { one: string; many: string }> = {
  EFFECT: { one: 'Effect', many: 'Effects' },
  MAKEUP: { one: 'Makeup look', many: 'Makeup' },
  BACKGROUND: { one: 'Background', many: 'Backgrounds' },
  BEAUTY: { one: 'Beauty rig', many: 'Beauty' },
}

export const AUDIENCE_LABELS: Record<MakeupAudience, string> = {
  ALL: 'Everyone',
  FEMALE: 'Female',
  MALE: 'Male',
}

// A start for the beauty rig's sliders - the names must match the rig's
// (DeepAR Studio shows them); see docs/features/camera-effects.md.
export const BEAUTY_TEMPLATE = JSON.stringify(
  [
    { key: 'face_slim', label: 'Slim', group: 'FACE', gameObject: 'FaceMesh', component: 'MeshRenderer', parameter: 'blendshape.faceSlim', from: 0, to: 100 },
    { key: 'v_shape', label: 'V shape', group: 'FACE', gameObject: 'FaceMesh', component: 'MeshRenderer', parameter: 'blendshape.vShape', from: 0, to: 100 },
    { key: 'chin', label: 'Chin', group: 'FACE', gameObject: 'FaceMesh', component: 'MeshRenderer', parameter: 'blendshape.chin', from: 0, to: 100 },
    { key: 'eye_size', label: 'Eyes', group: 'EYES', gameObject: 'FaceMesh', component: 'MeshRenderer', parameter: 'blendshape.eyeSize', from: 0, to: 100 },
    { key: 'nose', label: 'Nose', group: 'NOSE', gameObject: 'FaceMesh', component: 'MeshRenderer', parameter: 'blendshape.noseThin', from: 0, to: 100 },
    { key: 'lips', label: 'Lips', group: 'MOUTH', gameObject: 'FaceMesh', component: 'MeshRenderer', parameter: 'blendshape.lipsFull', from: 0, to: 100 },
  ],
  null,
  2,
)
