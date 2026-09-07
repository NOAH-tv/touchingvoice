// Display taxonomy for the supplied Vocal_01.glb. Bilateral L/R meshes are one
// selectable entry. These labels describe authored model parts, not audio-based
// diagnoses or inferred physiological activity.
export const STRUCTURE_DEFINITIONS = Object.freeze([
  { id: 'nas-mucosa', layer: 'nas', prefix: 'MuscosaOfNasopharynxAndOropharynx', name: '비인두 점막', english: 'Nasopharyngeal mucosa', description: '결합 점막의 위쪽 표시 영역입니다. 상부 형태 상태와 연결됩니다.' },
  { id: 'nasal-wall', layer: 'nas', prefix: 'LateralWallOfNasalCavity', name: '비강 외측벽', english: 'Lateral wall of nasal cavity', description: '모형 상단의 비강 벽 구조입니다. 위치와 윤곽을 확인합니다.' },
  { id: 'tensor-veli-palatini', layer: 'nas', prefix: 'TensorVeliPalatini', name: '구개범긴장근', english: 'Tensor veli palatini', description: '구개 주변의 좌우 근육 모형을 함께 선택합니다.' },
  { id: 'levator-veli-palatini', layer: 'nas', prefix: 'LevatorVeliPalatini', name: '구개범거근', english: 'Levator veli palatini', description: '구개 주변의 좌우 근육 모형과 연결된 형태 변화를 봅니다.' },
  { id: 'superior-constrictor', layer: 'nas', prefix: 'SuperiorPharyngealConstrictor', name: '상인두수축근', english: 'Superior pharyngeal constrictor', description: '인두 위쪽의 좌우 근육 모형을 함께 선택합니다.' },
  { id: 'oro-mucosa', layer: 'oro', prefix: 'MuscosaOfNasopharynxAndOropharynx', name: '구강인두 점막', english: 'Oropharyngeal mucosa', description: '결합 점막의 중간 표시 영역입니다. 중부 형태 상태와 연결됩니다.' },
  { id: 'middle-constrictor', layer: 'oro', prefix: 'MiddlePharyngealConstrictor', name: '중인두수축근', english: 'Middle pharyngeal constrictor', description: '인두 중간의 좌우 근육 모형을 함께 선택합니다.' },
  { id: 'palatopharyngeus', layer: 'oro', prefix: 'Palatopharyngeus', name: '구개인두근', english: 'Palatopharyngeus', description: '구개에서 인두 방향으로 이어지는 좌우 모형입니다.' },
  { id: 'laryngopharyngeal-mucosa', layer: 'aes', prefix: 'MuscosaOfLaryngopharynx', name: '하인두 점막', english: 'Laryngopharyngeal mucosa', description: '앞·뒤 점막 모형을 함께 선택합니다. 연결된 뒤쪽 상태를 보간합니다.' },
  { id: 'epiglottic-cartilage', layer: 'aes', prefix: 'Epiglottic_Cartilage', name: '후두개연골', english: 'Epiglottic cartilage', description: '후두 상부에 위치한 연골 모형의 윤곽을 확인합니다.' },
  { id: 'thyroepiglottic', layer: 'aes', prefix: 'ThyroepiglotticPartOfThyroarytenoid', name: '갑상후두개부', english: 'Thyroepiglottic part', description: '갑상피열근의 갑상후두개부 좌우 모형입니다.' },
  { id: 'thyropharyngeal', layer: 'aes', prefix: 'ThyropharyngealConstrictor', name: '갑상인두근', english: 'Thyropharyngeal constrictor', description: '하인두 주변의 좌우 근육 모형을 함께 선택합니다.' },
  { id: 'vestibular-ligament', layer: 'aes', prefix: 'Vestibular_Ligament', name: '전정인대', english: 'Vestibular ligament', description: '성대 위쪽에 배치된 좌우 인대 모형입니다.' },
  { id: 'vocalis', layer: 'src', prefix: 'Vocalis_Muscle', name: '성대근', english: 'Vocalis', description: '좌우 성대근 모형과 연결된 형태 변화를 확인합니다.' },
  { id: 'vocal-ligament', layer: 'src', prefix: 'Vocal_Ligament', name: '성대인대', english: 'Vocal ligament', description: '좌우 성대인대 모형을 함께 선택합니다.' },
  { id: 'thyroarytenoid', layer: 'src', prefix: 'Thyroarytenoid_Muscle', name: '갑상피열근', english: 'Thyroarytenoid', description: '성대 주변의 좌우 갑상피열근 모형입니다.' },
  { id: 'straight-cricothyroid', layer: 'src', prefix: 'StraightPartOfCricothyroid', name: '윤상갑상근 직부', english: 'Cricothyroid · straight part', description: '윤상갑상근 직부의 좌우 모형을 함께 선택합니다.' },
  { id: 'oblique-cricothyroid', layer: 'src', prefix: 'ObliquePartOfCricothyroid', name: '윤상갑상근 사부', english: 'Cricothyroid · oblique part', description: '윤상갑상근 사부의 좌우 모형을 함께 선택합니다.' },
  { id: 'lateral-cricoarytenoid', layer: 'src', prefix: 'LateralCricoarytenoid', name: '외측윤상피열근', english: 'Lateral cricoarytenoid', description: '후두 안쪽의 좌우 외측윤상피열근 모형입니다.' },
  { id: 'posterior-cricoarytenoid', layer: 'src', prefix: 'Posterior_Cricoarytenoid', name: '후윤상피열근', english: 'Posterior cricoarytenoid', description: '후두 뒤쪽의 좌우 근육 모형입니다. 측면으로 돌려 확인할 수 있습니다.' },
  { id: 'transverse-arytenoid', layer: 'src', prefix: 'TransverseArytenoid', name: '횡피열근', english: 'Transverse arytenoid', description: '피열연골 사이의 횡피열근 모형입니다.' },
  { id: 'oblique-arytenoid', layer: 'src', prefix: 'ObliqueArytenoid', name: '사피열근', english: 'Oblique arytenoid', description: '피열연골 주변의 좌우 사피열근 모형을 함께 선택합니다.' },
  { id: 'arytenoid-cartilage', layer: 'src', prefix: 'Arytenoid_Cartilage', name: '피열연골', english: 'Arytenoid cartilage', description: '좌우 피열연골 모형의 위치와 연결된 형태를 확인합니다.' },
  { id: 'thyroid-cartilage', layer: 'src', prefix: 'Thyroid_Cartilage', name: '갑상연골', english: 'Thyroid cartilage', description: '후두 바깥쪽의 갑상연골 모형입니다. 투명도로 안쪽 구조를 볼 수 있습니다.' },
  { id: 'cricoid-cartilage', layer: 'src', prefix: 'Cricoid_Cartilage', name: '윤상연골', english: 'Cricoid cartilage', description: '후두 아래쪽의 윤상연골 모형을 선택합니다.' },
  { id: 'conus-elasticus', layer: 'src', prefix: 'Conus_Elasticus', name: '탄성원뿔', english: 'Conus elasticus', description: '성대 아래쪽의 좌우 막 구조 모형입니다.' },
  { id: 'median-cricothyroid-ligament', layer: 'src', prefix: 'MedianCricothyroid_Ligament', name: '정중윤상갑상인대', english: 'Median cricothyroid ligament', description: '윤상연골과 갑상연골 사이의 인대 모형입니다.' },
]);

export function structureForMesh(meshName, layer) {
  return STRUCTURE_DEFINITIONS.find((structure) => structure.layer === layer && meshName.startsWith(structure.prefix)) || null;
}
