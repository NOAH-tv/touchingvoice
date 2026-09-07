/**
 * Descriptive reference transcribed and shortened from the user's supplied
 * touchingvoice_3d_anatomy_한글.html, ANATOMY block (tvp…pca).
 * Keys match STRUCTURE_DEFINITIONS in anatomy-details.js.
 * This preserves the supplied anatomical teaching text; it does not establish
 * that audio features measure these structures. SEP hypotheses, subjective
 * sensations and audio-to-muscle assertions have been omitted. Structures
 * without supplied origin/insertion descriptions or present meshes are omitted.
 */
export const ANATOMY_REFERENCE = Object.freeze({
  'tensor-veli-palatini': Object.freeze({
    origin: '접형골 익상돌기의 주상와와 접형골 극 안쪽에서 시작합니다. 이관 막성부의 앞가쪽에도 부착합니다.',
    insertion: '섬유가 힘줄로 모여 익상돌기구를 안쪽으로 감아 돌고, 구개건막에 부착합니다.',
    actions: '삼킴과 하품 때 이관을 열어 비인두와 중이 사이의 압력 평형을 돕습니다. 양쪽 수축은 연구개를 긴장시키고, 한쪽 수축은 연구개를 한쪽으로 움직입니다.',
    relations: '안쪽에는 내측익상판·이관·구개범거근, 가쪽에는 내측익상근·중경막동맥·하악신경이 위치합니다.',
  }),
  'levator-veli-palatini': Object.freeze({
    origin: '측두골 추체부 아래면 안쪽의 작은 힘줄에서 시작합니다. 일부 섬유는 이관 연골 아래쪽 또는 접형골 초상돌기에서 시작합니다.',
    insertion: '위쪽 구개건막에 부착하며, 정중선에서 반대쪽 근육 섬유와 교차합니다.',
    actions: '뒤쪽 연구개를 들어 올리고 뒤로 당깁니다. 비인두 측벽을 뒤안쪽으로 당겨 공간을 좁힙니다.',
  }),
  'superior-constrictor': Object.freeze({
    origin: '접형골 익상돌기구, 익돌하악봉선 뒤면, 하악골 악설골근선, 혀 가쪽에서 시작합니다.',
    insertion: '뒤쪽 정중인두봉선에 부착하며, 인두봉선은 후두골 기저부의 인두결절에 연결됩니다.',
    actions: '삼킴 때 인두의 위쪽 부분을 수축시킵니다.',
    relations: '앞쪽의 협근과 익돌하악봉선으로 구분됩니다. 아래쪽에서는 중인두수축근과 겹치며, 두 층 사이로 설인신경이 지나갑니다.',
  }),
  'middle-constrictor': Object.freeze({
    origin: '설골의 대각·소각과 경돌설골인대 아래쪽에서 시작합니다.',
    insertion: '뒤쪽 인두의 인두봉선에 부착합니다.',
    actions: '삼킴 때 인두의 중간 부분을 수축시킵니다.',
    relations: '상인두수축근과의 사이에 경돌인두근과 설인신경이 지나갑니다. 구개인두근은 이 근육의 안쪽에 위치합니다.',
  }),
  'palatopharyngeus': Object.freeze({
    origin: '구개골 수평판과 위쪽 구개건막에서 두 근속으로 시작하며, 구개범거근이 두 근속을 나눕니다.',
    insertion: '연구개 뒤가쪽에서 두 근속이 합쳐지고 이관인두근과 섞여, 인두 가쪽면과 갑상연골 뒤면에 부착합니다.',
    actions: '삼킴 때 인두를 위·앞·안쪽으로 당깁니다. 구개인두궁을 앞으로 당겨 연구개를 긴장시킵니다.',
    relations: '점막과 함께 구강인두 양쪽의 구개인두궁, 즉 뒤구협주를 형성합니다.',
  }),
  'thyroepiglottic': Object.freeze({
    origin: '갑상피열근의 일부로, 갑상연골판 안쪽면과 윤상갑상인대에서 시작합니다.',
    insertion: '피열연골을 넘어가는 섬유가 피열후두개주름 또는 후두개 가쪽에 부착합니다.',
    actions: '갑상후두개 섬유는 후두 입구를 넓히는 작용을 합니다.',
  }),
  'thyropharyngeal': Object.freeze({
    origin: '갑상연골판의 사선에서 시작합니다. 일부 섬유는 갑상연골 하각과 윤상갑상근을 덮는 건성 섬유대에서 시작합니다.',
    insertion: '뒤안쪽으로 주행하여 인두봉선에서 반대쪽 근육과 합쳐집니다.',
    actions: '인두의 아래쪽 부분을 수축시킵니다.',
  }),
  'vocalis': Object.freeze({
    origin: '갑상피열근의 일부로, 갑상연골판 사이의 각에서 시작해 성대인대와 나란히 주행합니다.',
    insertion: '피열연골의 성대돌기에 부착합니다.',
    actions: '말하거나 노래할 때 성대인대의 미세 조정에 관여합니다.',
    relations: '성대인대·점막과 함께 진성대주름을 구성합니다.',
  }),
  'thyroarytenoid': Object.freeze({
    origin: '성대주름 가쪽의 갑상연골판 안쪽면과 윤상갑상인대에서 시작합니다.',
    insertion: '피열연골 앞가쪽면에 부착합니다. 성대인대와 나란한 섬유는 성대근, 피열연골을 넘어가는 섬유는 갑상후두개부를 이룹니다.',
    actions: '성대인대를 짧게 하고 성대를 안쪽으로 모으는 내전에 관여합니다.',
  }),
  'straight-cricothyroid': Object.freeze({
    origin: '앞쪽 후두 바깥면의 윤상연골궁에서 시작합니다.',
    insertion: '직부는 위쪽으로 주행하여 갑상연골판 아래모서리에 부착합니다.',
    actions: '윤상연골과 갑상연골 사이의 공간을 줄여 성대를 늘이고 장력 변화에 관여합니다.',
    relations: '정중윤상갑상인대가 왼쪽과 오른쪽 근육을 나눕니다.',
  }),
  'oblique-cricothyroid': Object.freeze({
    origin: '앞쪽 후두 바깥면의 윤상연골궁에서 시작합니다.',
    insertion: '사부는 뒤가쪽으로 주행하여 갑상연골 하각에 부착합니다.',
    actions: '윤상연골과 갑상연골 사이의 공간을 줄여 성대를 늘이고 장력 변화에 관여합니다.',
    relations: '정중윤상갑상인대가 왼쪽과 오른쪽 근육을 나눕니다.',
  }),
  'lateral-cricoarytenoid': Object.freeze({
    origin: '윤상연골궁 위모서리에서 시작합니다.',
    insertion: '뒤쪽으로 비스듬하게 주행하여 피열연골 근돌기에 부착합니다.',
    actions: '피열연골을 안쪽으로 회전시켜 성대를 내전하고, 성문의 앞쪽을 닫는 데 관여합니다.',
  }),
  'posterior-cricoarytenoid': Object.freeze({
    origin: '뒤쪽 후두의 윤상연골판 뒤면에서 시작합니다.',
    insertion: '위쪽으로 주행하여 같은 쪽 피열연골 근돌기에 부착합니다.',
    actions: '성대를 바깥쪽으로 벌리는 외전을 통해 성문틈을 여는 근육입니다.',
  }),
  'transverse-arytenoid': Object.freeze({
    origin: '사피열근 깊은 쪽에 있는 짝이 없는 후두 내근으로, 피열연골 근돌기 뒤면에서 시작합니다.',
    insertion: '반대쪽 피열연골 근돌기에 부착합니다.',
    actions: '성대를 안쪽으로 모으는 내전과 성문 뒤쪽을 닫는 데 관여합니다.',
  }),
});
