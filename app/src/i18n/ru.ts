/* Russian — source of truth dictionary. All other languages conform to this shape. */

interface Section {
  [key: string]: string;
}
interface Dict {
  [section: string]: Section;
}

export const ru: Dict = {
  app: {
    name: 'Крысиные желания',
    nameShort: 'крысиное',
    tagline: 'вишлист для крысят',
  },
  nav: {
    myList: 'мой список',
    recent: 'недавнее',
    archive: 'архив',
    people: 'крысята',
    invite: 'пригласить кого-нибудь',
    filterBy: 'фильтр',
  },
  occasion: {
    anytime: 'просто так',
    birthday: 'др',
    holidays: 'праздники',
    treat: 'мелочёвка',
  },
  list: {
    currentlySaved: 'сейчас в списке',
    headlineMine: 'то, что я бы реально хотел',
    annotation: '(да, даже по полной цене)',
    countOfTotal: '{count} из {total}',
    addItem: '+ добавить',
    addFirst: 'добавить первое',
    crossOff: 'вычеркнуть',
    item: 'позиция',
    maker: 'марка',
    price: 'цена',
    search: 'поиск по списку',
  },
  empty: {
    title: 'тут пока пусто.',
    body: 'что последнее ты заскринил и больше не открывал? вот с него и начни.',
    sign: 'эй?',
  },
  add: {
    title: 'что зацепило?',
    sub: 'самое необходимое — детали потом',
    thing: 'сама штука',
    thingPh: 'например, эмалированная кружка',
    makerLabel: 'марка / где',
    makerPh: 'бренд или магазин',
    priceLabel: 'цена (примерно)',
    pricePh: '€25 или €25–40',
    occasionLabel: 'для чего',
    noteLabel: 'заметка (по желанию)',
    notePh: 'цвет, размер, где видел…',
    save: 'сохранить',
    cancel: 'отмена',
  },
  friend: {
    headlineSuffix: '— это список',
    annotation: '(у них хороший вкус)',
    metaUpdated: 'обновлено {when}',
    claimHint:
      'заберёшь — остальные увидят что подарок занят. зачёркнутые уже взяли. сам адресат ничего этого не видит.',
    claim: 'я возьму',
    claimedBy: '{name} берёт ✓',
    you: 'ты',
  },
  auth: {
    pageEyebrow: 'вход',
    pageTitle: 'входи и кидай желания',
    pageHint: 'мы пришлём волшебную ссылку — пароль не нужен',
    signIn: 'войти',
    signOut: 'выйти',
    emailLabel: 'email',
    emailPh: 'твой@email',
    sendMagic: 'прислать ссылку',
    magicSent: 'готово — проверь почту',
    magicSentBody: 'кликни на ссылку из письма и вернёшься сюда уже залогиненным.',
    sending: 'отправляем…',
    invalidEmail: 'это не похоже на email',
    settings: 'настройки →',
    signedInAs: 'ты вошёл как {name}',
    genericError: 'что-то пошло не так. попробуй ещё раз?',
  },
  onboarding: {
    eyebrow: 'знакомство',
    title: 'как тебя называть?',
    sub: 'это увидят твои крысята в списке людей',
    displayNameLabel: 'имя',
    displayNamePh: 'Маша',
    handleLabel: 'короткое имя (по желанию)',
    handlePh: 'masha — только латиница и цифры',
    handleHint: 'будет в адресе твоего списка. можно поменять потом.',
    continue: 'продолжаем',
    handleTaken: 'такое короткое имя уже занято',
    handleInvalid: 'только латиница, цифры, дефис и подчёркивание',
  },
  home: {
    welcome: 'привет, {name}',
    placeholder: 'тут будет твой список и списки друзей. пока тихо.',
  },
  common: {
    cancel: 'отмена',
    save: 'сохранить',
    delete: 'удалить',
    confirm: 'подтвердить',
    back: 'назад',
    yes: 'да',
    no: 'нет',
  },
};

export type Translation = Dict;
