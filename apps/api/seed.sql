-- Demo data for local development & preview.
-- Demo accounts (email login only):
--   家长 parent@example.com / demo1234（名下虚拟子账号：林小满）
--   家长 parent2@example.com / demo1234（名下虚拟子账号：周予安）
--   管理员 admin@example.com / admin1234
-- 学生没有邮箱、不能独立登录，只能由家长切换进入。

DELETE FROM parent_word_focus;
DELETE FROM incentive_event;
DELETE FROM incentive_rule;
DELETE FROM word_mastery;
DELETE FROM practice_record;
DELETE FROM practice_session;
DELETE FROM question;
DELETE FROM word_audio;
DELETE FROM word_image;
DELETE FROM unit_word;
DELETE FROM word;
DELETE FROM unit;
DELETE FROM textbook;
DELETE FROM family_member;
DELETE FROM family;
DELETE FROM user;

INSERT INTO user (id, role, nickname, email, password_hash, enabled) VALUES
  ('u-admin', 'admin', '系统管理员', 'admin@example.com', 'pbkdf2$100000$admin-demo-salt$e688d0d2f75df9fc0d80d2f29a178fe59f45d7c822939cf9e3ebe4f32de5263a', 1),
  ('u-parent', 'parent', '林妈妈', 'parent@example.com', 'pbkdf2$100000$parent-demo-salt$03b10c918411e0be9bf74dfe09a82a1278a73cf725b9f874a80742dc4c6d3b90', 1),
  -- 演示学生是家长账号内的虚拟子账号，没有邮箱、不能独立登录；
  -- 密码哈希只是占位，登录入口按角色拦 student，且邮箱为空也查不到账号。
  ('u-student', 'student', '林小满', NULL, 'pbkdf2$100000$student-demo-salt$7177139d2629d9452a8f9cd23af3b149d615b846d01c85ddf6a946c3293da8be', 1),
  ('u-student-2', 'student', '周予安', NULL, 'pbkdf2$100000$student-demo-salt$7177139d2629d9452a8f9cd23af3b149d615b846d01c85ddf6a946c3293da8be', 1),
  ('u-parent-2', 'parent', '周爸爸', 'parent2@example.com', 'pbkdf2$100000$parent-demo-salt$03b10c918411e0be9bf74dfe09a82a1278a73cf725b9f874a80742dc4c6d3b90', 1);

INSERT INTO family (id, parent_user_id) VALUES ('f-1', 'u-parent');
INSERT INTO family (id, parent_user_id) VALUES ('f-2', 'u-parent-2');

INSERT INTO family_member (id, family_id, student_user_id, relation, status, enabled) VALUES
  ('fm-1', 'f-1', 'u-student', '女儿', 'active', 1),
  ('fm-2', 'f-2', 'u-student-2', '儿子', 'active', 1);

INSERT INTO textbook (id, name, version, grade, semester, status, cover_color) VALUES
  ('tb-3a', '英语（三年级上册）', '人教版', '三年级', '上册', 'published', 'forest'),
  ('tb-4a', '英语（四年级上册）', '人教版', '四年级', '上册', 'published', 'ocean'),
  ('tb-7a', '英语（七年级上册）', '外研版', '七年级', '上册', 'published', 'clay');

INSERT INTO unit (id, textbook_id, unit_no, unit_name, sort_order) VALUES
  ('un-3a-1', 'tb-3a', 1, 'Unit 1  Hello!', 1),
  ('un-3a-2', 'tb-3a', 2, 'Unit 2  My Family', 2),
  ('un-3a-3', 'tb-3a', 3, 'Unit 3  Colours', 3),
  ('un-3a-4', 'tb-3a', 4, 'Unit 4  Good Morning', 4),
  ('un-4a-1', 'tb-4a', 1, 'Unit 1  Weather', 1),
  ('un-4a-2', 'tb-4a', 2, 'Unit 2  My Subjects', 2),
  ('un-4a-3', 'tb-4a', 3, 'Unit 3  Meals', 3),
  ('un-7a-1', 'tb-7a', 1, 'Unit 1  Our Planet', 1),
  ('un-7a-2', 'tb-7a', 2, 'Unit 2  Travel and Culture', 2),
  ('un-7a-3', 'tb-7a', 3, 'Unit 3  Communication', 3);

INSERT INTO word (id, spelling, phonetic, pos, chinese_def, english_def, difficulty, has_image, image_id, enabled, examples, collocations) VALUES
  ('w-apple', 'apple', '/ˈæpl/', 'n.', '苹果', 'a round fruit with red or green skin', 1, 1, 'img-apple', 1, '[{"en":"I eat an apple every day.","zh":"我每天吃一个苹果。"},{"en":"This apple is red and sweet.","zh":"这个苹果又红又甜。"}]', '[{"phrase":"an apple tree","zh":"一棵苹果树"},{"phrase":"apple juice","zh":"苹果汁"}]'),
  ('w-banana', 'banana', '/bəˈnɑːnə/', 'n.', '香蕉', 'a long yellow fruit', 1, 0, NULL, 1, '[{"en":"The banana is yellow.","zh":"香蕉是黄色的。"}]', '[{"phrase":"a banana peel","zh":"香蕉皮"}]'),
  ('w-book', 'book', '/bʊk/', 'n.', '书；书本', 'a set of printed pages', 1, 1, 'img-book', 1, '[{"en":"This is my English book.","zh":"这是我的英语书。"}]', '[{"phrase":"read a book","zh":"读书"},{"phrase":"story book","zh":"故事书"}]'),
  ('w-cat', 'cat', '/kæt/', 'n.', '猫', 'a small animal kept as a pet', 1, 1, 'img-cat', 1, '[{"en":"The cat is sleeping.","zh":"猫正在睡觉。"}]', '[{"phrase":"a black cat","zh":"一只黑猫"}]'),
  ('w-dog', 'dog', '/dɒɡ/', 'n.', '狗', 'an animal that people keep as a pet', 1, 1, 'img-dog', 1, '[{"en":"My dog likes to run.","zh":"我的狗喜欢奔跑。"}]', '[{"phrase":"walk the dog","zh":"遛狗"}]'),
  ('w-school', 'school', '/skuːl/', 'n.', '学校', 'a place where children learn', 1, 1, 'img-school', 1, '[{"en":"We go to school by bus.","zh":"我们坐公交车去学校。"}]', '[{"phrase":"go to school","zh":"去上学"},{"phrase":"after school","zh":"放学后"}]'),
  ('w-water', 'water', '/ˈwɔːtə/', 'n.', '水', 'clear liquid that people drink', 1, 1, 'img-water', 1, '[{"en":"Please drink some water.","zh":"请喝点水。"}]', '[{"phrase":"a glass of water","zh":"一杯水"},{"phrase":"drink water","zh":"喝水"}]'),
  ('w-family', 'family', '/ˈfæməli/', 'n.', '家庭；家人', 'a group of parents and children', 1, 1, 'img-family', 1, '[{"en":"I love my family.","zh":"我爱我的家人。"}]', '[{"phrase":"family photo","zh":"全家福"}]'),
  ('w-teacher', 'teacher', '/ˈtiːtʃə/', 'n.', '老师', 'a person who teaches students', 1, 1, 'img-teacher', 1, '[{"en":"Our teacher is very kind.","zh":"我们的老师很和蔼。"}]', '[{"phrase":"an English teacher","zh":"一位英语老师"}]'),
  ('w-bird', 'bird', '/bɜːd/', 'n.', '鸟', 'an animal with wings and feathers', 1, 1, 'img-bird', 1, '[{"en":"A bird is singing in the tree.","zh":"一只鸟在树上唱歌。"}]', '[{"phrase":"a little bird","zh":"一只小鸟"}]'),
  ('w-tree', 'tree', '/triː/', 'n.', '树', 'a tall plant with a trunk', 1, 1, 'img-tree', 1, '[{"en":"The tree is very tall.","zh":"这棵树很高。"}]', '[{"phrase":"plant a tree","zh":"种一棵树"}]'),
  ('w-pen', 'pen', '/pen/', 'n.', '钢笔', 'a tool used for writing', 1, 1, 'img-pen', 1, '[{"en":"May I use your pen?","zh":"我可以用你的钢笔吗？"}]', '[{"phrase":"a red pen","zh":"一支红钢笔"}]'),
  ('w-bag', 'bag', '/bæɡ/', 'n.', '包；书包', 'a container used to carry things', 1, 1, 'img-bag', 1, '[{"en":"My bag is on the desk.","zh":"我的书包在桌子上。"}]', '[{"phrase":"school bag","zh":"书包"}]'),
  ('w-ruler', 'ruler', '/ˈruːlə/', 'n.', '尺子', 'a tool used to draw straight lines', 1, 0, NULL, 1, '[{"en":"This ruler is long.","zh":"这把尺子很长。"}]', '[{"phrase":"a new ruler","zh":"一把新尺子"}]'),
  ('w-pencil', 'pencil', '/ˈpensl/', 'n.', '铅笔', 'a wooden tool used for writing', 1, 0, NULL, 1, '[{"en":"I have a yellow pencil.","zh":"我有一支黄铅笔。"}]', '[{"phrase":"pencil case","zh":"铅笔盒"}]'),
  ('w-red', 'red', '/red/', 'adj.', '红色的', 'having the colour of blood', 1, 0, NULL, 1, '[{"en":"The apple is red.","zh":"苹果是红色的。"}]', '[{"phrase":"red flower","zh":"红花"}]'),
  ('w-blue', 'blue', '/bluː/', 'adj.', '蓝色的', 'having the colour of the sky', 1, 0, NULL, 1, '[{"en":"The sky is blue today.","zh":"今天天空是蓝色的。"}]', '[{"phrase":"deep blue","zh":"深蓝色"}]'),
  ('w-green', 'green', '/ɡriːn/', 'adj.', '绿色的', 'having the colour of grass', 1, 0, NULL, 1, '[{"en":"The leaves are green.","zh":"叶子是绿色的。"}]', '[{"phrase":"green tea","zh":"绿茶"}]'),
  ('w-friend', 'friend', '/frend/', 'n.', '朋友', 'a person you know and like', 1, 0, NULL, 1, '[{"en":"She is my best friend.","zh":"她是我最好的朋友。"}]', '[{"phrase":"make friends","zh":"交朋友"}]'),
  ('w-happy', 'happy', '/ˈhæpi/', 'adj.', '开心的；快乐的', 'feeling pleased', 1, 0, NULL, 1, '[{"en":"I am happy to see you.","zh":"见到你我很开心。"}]', '[{"phrase":"feel happy","zh":"感到开心"}]'),
  ('w-good', 'good', '/ɡʊd/', 'adj.', '好的', 'of high quality', 1, 0, NULL, 1, '[{"en":"She is a good student.","zh":"她是个好学生。"}]', '[{"phrase":"good morning","zh":"早上好"}]'),
  ('w-morning', 'morning', '/ˈmɔːnɪŋ/', 'n.', '早晨；上午', 'the early part of the day', 1, 0, NULL, 1, '[{"en":"Good morning, Miss Li.","zh":"早上好，李老师。"}]', '[{"phrase":"in the morning","zh":"在上午"}]'),
  ('w-night', 'night', '/naɪt/', 'n.', '夜晚', 'the dark part of the day', 1, 0, NULL, 1, '[{"en":"We sleep at night.","zh":"我们晚上睡觉。"}]', '[{"phrase":"good night","zh":"晚安"}]'),
  ('w-hello', 'hello', '/həˈləʊ/', 'int.', '你好', 'a greeting', 1, 0, NULL, 1, '[{"en":"Hello, nice to meet you.","zh":"你好，很高兴见到你。"}]', '[{"phrase":"say hello","zh":"打招呼"}]'),
  ('w-weather', 'weather', '/ˈweðə/', 'n.', '天气', 'the condition of the air outside', 2, 0, NULL, 1, '[{"en":"The weather is fine today.","zh":"今天天气很好。"}]', '[{"phrase":"good weather","zh":"好天气"}]'),
  ('w-sunny', 'sunny', '/ˈsʌni/', 'adj.', '晴朗的', 'with a lot of sunshine', 2, 0, NULL, 1, '[{"en":"It is a sunny day.","zh":"这是一个晴天。"}]', '[{"phrase":"sunny weather","zh":"晴朗的天气"}]'),
  ('w-rainy', 'rainy', '/ˈreɪni/', 'adj.', '下雨的', 'with a lot of rain', 2, 0, NULL, 1, '[{"en":"It is rainy in spring.","zh":"春天多雨。"}]', '[{"phrase":"a rainy day","zh":"一个雨天"}]'),
  ('w-cloud', 'cloud', '/klaʊd/', 'n.', '云', 'a white or grey mass in the sky', 2, 0, NULL, 1, '[{"en":"There is a cloud in the sky.","zh":"天空中有一朵云。"}]', '[{"phrase":"dark cloud","zh":"乌云"}]'),
  ('w-wind', 'wind', '/wɪnd/', 'n.', '风', 'air moving outside', 2, 0, NULL, 1, '[{"en":"The wind is strong today.","zh":"今天风很大。"}]', '[{"phrase":"cold wind","zh":"冷风"}]'),
  ('w-cold', 'cold', '/kəʊld/', 'adj.', '寒冷的', 'having a low temperature', 2, 0, NULL, 1, '[{"en":"It is cold in winter.","zh":"冬天很冷。"}]', '[{"phrase":"cold water","zh":"冷水"}]'),
  ('w-english', 'English', '/ˈɪŋɡlɪʃ/', 'n.', '英语', 'the English language', 2, 0, NULL, 1, '[{"en":"I like my English class.","zh":"我喜欢我的英语课。"}]', '[{"phrase":"speak English","zh":"说英语"}]'),
  ('w-chinese', 'Chinese', '/ˌtʃaɪˈniːz/', 'n.', '语文；中文', 'the Chinese language', 2, 0, NULL, 1, '[{"en":"We read Chinese in the morning.","zh":"我们早上读语文。"}]', '[{"phrase":"Chinese class","zh":"语文课"}]'),
  ('w-math', 'math', '/mæθ/', 'n.', '数学', 'the study of numbers', 2, 0, NULL, 1, '[{"en":"Math is my favourite subject.","zh":"数学是我最喜欢的科目。"}]', '[{"phrase":"math problem","zh":"数学题"}]'),
  ('w-music', 'music', '/ˈmjuːzɪk/', 'n.', '音乐', 'sounds arranged in a pleasing way', 2, 0, NULL, 1, '[{"en":"We have music on Friday.","zh":"我们星期五有音乐课。"}]', '[{"phrase":"listen to music","zh":"听音乐"}]'),
  ('w-art', 'art', '/ɑːt/', 'n.', '美术；艺术', 'creative work such as painting', 2, 0, NULL, 1, '[{"en":"She is good at art.","zh":"她擅长美术。"}]', '[{"phrase":"art class","zh":"美术课"}]'),
  ('w-science', 'science', '/ˈsaɪəns/', 'n.', '科学', 'the study of the natural world', 2, 0, NULL, 1, '[{"en":"Science is interesting.","zh":"科学很有趣。"}]', '[{"phrase":"science book","zh":"科学书"}]'),
  ('w-breakfast', 'breakfast', '/ˈbrekfəst/', 'n.', '早餐', 'the first meal of the day', 2, 0, NULL, 1, '[{"en":"I have breakfast at seven.","zh":"我七点吃早餐。"}]', '[{"phrase":"have breakfast","zh":"吃早餐"}]'),
  ('w-lunch', 'lunch', '/lʌntʃ/', 'n.', '午餐', 'the meal in the middle of the day', 2, 0, NULL, 1, '[{"en":"We have lunch at school.","zh":"我们在学校吃午餐。"}]', '[{"phrase":"have lunch","zh":"吃午餐"}]'),
  ('w-dinner', 'dinner', '/ˈdɪnə/', 'n.', '晚餐', 'the main meal in the evening', 2, 0, NULL, 1, '[{"en":"Dinner is ready.","zh":"晚餐准备好了。"}]', '[{"phrase":"have dinner","zh":"吃晚餐"}]'),
  ('w-bread', 'bread', '/bred/', 'n.', '面包', 'a food made from flour', 2, 0, NULL, 1, '[{"en":"I would like some bread.","zh":"我想要一些面包。"}]', '[{"phrase":"a piece of bread","zh":"一片面包"}]'),
  ('w-milk', 'milk', '/mɪlk/', 'n.', '牛奶', 'a white drink from cows', 2, 0, NULL, 1, '[{"en":"Milk is good for us.","zh":"牛奶对我们有益。"}]', '[{"phrase":"a glass of milk","zh":"一杯牛奶"}]'),
  ('w-egg', 'egg', '/eɡ/', 'n.', '鸡蛋', 'a food laid by a bird', 2, 0, NULL, 1, '[{"en":"I have an egg for breakfast.","zh":"我早餐吃一个鸡蛋。"}]', '[{"phrase":"fried egg","zh":"煎蛋"}]'),
  ('w-environment', 'environment', '/ɪnˈvaɪrənmənt/', 'n.', '环境', 'the natural world around us', 3, 0, NULL, 1, '[{"en":"We should protect the environment.","zh":"我们应该保护环境。"}]', '[{"phrase":"protect the environment","zh":"保护环境"}]'),
  ('w-protect', 'protect', '/prəˈtekt/', 'v.', '保护', 'to keep someone or something safe', 3, 0, NULL, 1, '[{"en":"We must protect wild animals.","zh":"我们必须保护野生动物。"}]', '[{"phrase":"protect nature","zh":"保护自然"}]'),
  ('w-pollution', 'pollution', '/pəˈluːʃn/', 'n.', '污染', 'damage to air, water or land', 3, 0, NULL, 1, '[{"en":"Air pollution is a serious problem.","zh":"空气污染是一个严重的问题。"}]', '[{"phrase":"reduce pollution","zh":"减少污染"}]'),
  ('w-recycle', 'recycle', '/ˌriːˈsaɪkl/', 'v.', '回收利用', 'to use something again', 3, 0, NULL, 1, '[{"en":"We recycle paper and bottles.","zh":"我们回收纸张和瓶子。"}]', '[{"phrase":"recycle waste","zh":"回收废弃物"}]'),
  ('w-energy', 'energy', '/ˈenədʒi/', 'n.', '能源；能量', 'power used for light and heat', 3, 0, NULL, 1, '[{"en":"Solar energy is clean.","zh":"太阳能是清洁的。"}]', '[{"phrase":"save energy","zh":"节约能源"}]'),
  ('w-planet', 'planet', '/ˈplænɪt/', 'n.', '行星；地球', 'a large round object in space', 3, 0, NULL, 1, '[{"en":"The earth is our planet.","zh":"地球是我们的星球。"}]', '[{"phrase":"save the planet","zh":"拯救地球"}]'),
  ('w-journey', 'journey', '/ˈdʒɜːni/', 'n.', '旅行；旅程', 'a trip from one place to another', 3, 0, NULL, 1, '[{"en":"The journey took three hours.","zh":"这段旅程花了三个小时。"}]', '[{"phrase":"a long journey","zh":"一段长途旅行"}]'),
  ('w-discover', 'discover', '/dɪˈskʌvə/', 'v.', '发现', 'to find something for the first time', 3, 0, NULL, 1, '[{"en":"We discovered a small village.","zh":"我们发现了一个小村庄。"}]', '[{"phrase":"discover the truth","zh":"发现真相"}]'),
  ('w-culture', 'culture', '/ˈkʌltʃə/', 'n.', '文化', 'the way of life of a people', 3, 0, NULL, 1, '[{"en":"I am interested in Chinese culture.","zh":"我对中国文化感兴趣。"}]', '[{"phrase":"local culture","zh":"当地文化"}]'),
  ('w-ancient', 'ancient', '/ˈeɪnʃənt/', 'adj.', '古代的', 'from a long time ago', 3, 0, NULL, 1, '[{"en":"This is an ancient city.","zh":"这是一座古城。"}]', '[{"phrase":"ancient history","zh":"古代历史"}]'),
  ('w-modern', 'modern', '/ˈmɒdn/', 'adj.', '现代的', 'belonging to the present time', 3, 0, NULL, 1, '[{"en":"Shanghai is a modern city.","zh":"上海是一座现代化城市。"}]', '[{"phrase":"modern life","zh":"现代生活"}]'),
  ('w-tradition', 'tradition', '/trəˈdɪʃn/', 'n.', '传统', 'a custom passed down over time', 3, 0, NULL, 1, '[{"en":"Spring Festival is a Chinese tradition.","zh":"春节是中国的传统。"}]', '[{"phrase":"keep a tradition","zh":"保留传统"}]'),
  ('w-communicate', 'communicate', '/kəˈmjuːnɪkeɪt/', 'v.', '交流；沟通', 'to share information with others', 3, 0, NULL, 1, '[{"en":"We communicate in English.","zh":"我们用英语交流。"}]', '[{"phrase":"communicate with others","zh":"与他人沟通"}]'),
  ('w-language', 'language', '/ˈlæŋɡwɪdʒ/', 'n.', '语言', 'a system of words used by people', 3, 0, NULL, 1, '[{"en":"English is a world language.","zh":"英语是一门世界语言。"}]', '[{"phrase":"learn a language","zh":"学习一门语言"}]'),
  ('w-meaning', 'meaning', '/ˈmiːnɪŋ/', 'n.', '意思；含义', 'what a word or sign expresses', 3, 0, NULL, 1, '[{"en":"What is the meaning of this word?","zh":"这个单词是什么意思？"}]', '[{"phrase":"the meaning of life","zh":"人生的意义"}]'),
  ('w-express', 'express', '/ɪkˈspres/', 'v.', '表达', 'to show what you think or feel', 3, 0, NULL, 1, '[{"en":"She can express her ideas clearly.","zh":"她能清楚地表达自己的想法。"}]', '[{"phrase":"express an idea","zh":"表达一个想法"}]'),
  ('w-discuss', 'discuss', '/dɪˈskʌs/', 'v.', '讨论', 'to talk about something with others', 3, 0, NULL, 1, '[{"en":"We discuss the question in groups.","zh":"我们分组讨论这个问题。"}]', '[{"phrase":"discuss a plan","zh":"讨论计划"}]'),
  ('w-opinion', 'opinion', '/əˈpɪnjən/', 'n.', '观点；意见', 'what someone thinks about something', 3, 0, NULL, 1, '[{"en":"In my opinion, reading is important.","zh":"在我看来，阅读很重要。"}]', '[{"phrase":"share an opinion","zh":"分享观点"}]');

INSERT INTO unit_word (id, unit_id, word_id, sort_order) VALUES
  ('uw-1', 'un-3a-1', 'w-apple', 1), ('uw-2', 'un-3a-1', 'w-banana', 2), ('uw-3', 'un-3a-1', 'w-book', 3),
  ('uw-4', 'un-3a-1', 'w-cat', 4), ('uw-5', 'un-3a-1', 'w-dog', 5), ('uw-6', 'un-3a-1', 'w-school', 6),
  ('uw-7', 'un-3a-2', 'w-water', 1), ('uw-8', 'un-3a-2', 'w-family', 2), ('uw-9', 'un-3a-2', 'w-teacher', 3),
  ('uw-10', 'un-3a-2', 'w-bird', 4), ('uw-11', 'un-3a-2', 'w-tree', 5), ('uw-12', 'un-3a-2', 'w-pen', 6),
  ('uw-13', 'un-3a-3', 'w-bag', 1), ('uw-14', 'un-3a-3', 'w-ruler', 2), ('uw-15', 'un-3a-3', 'w-pencil', 3),
  ('uw-16', 'un-3a-3', 'w-red', 4), ('uw-17', 'un-3a-3', 'w-blue', 5), ('uw-18', 'un-3a-3', 'w-green', 6),
  ('uw-19', 'un-3a-4', 'w-friend', 1), ('uw-20', 'un-3a-4', 'w-happy', 2), ('uw-21', 'un-3a-4', 'w-good', 3),
  ('uw-22', 'un-3a-4', 'w-morning', 4), ('uw-23', 'un-3a-4', 'w-night', 5), ('uw-24', 'un-3a-4', 'w-hello', 6),
  ('uw-25', 'un-4a-1', 'w-weather', 1), ('uw-26', 'un-4a-1', 'w-sunny', 2), ('uw-27', 'un-4a-1', 'w-rainy', 3),
  ('uw-28', 'un-4a-1', 'w-cloud', 4), ('uw-29', 'un-4a-1', 'w-wind', 5), ('uw-30', 'un-4a-1', 'w-cold', 6),
  ('uw-31', 'un-4a-2', 'w-english', 1), ('uw-32', 'un-4a-2', 'w-chinese', 2), ('uw-33', 'un-4a-2', 'w-math', 3),
  ('uw-34', 'un-4a-2', 'w-music', 4), ('uw-35', 'un-4a-2', 'w-art', 5), ('uw-36', 'un-4a-2', 'w-science', 6),
  ('uw-37', 'un-4a-3', 'w-breakfast', 1), ('uw-38', 'un-4a-3', 'w-lunch', 2), ('uw-39', 'un-4a-3', 'w-dinner', 3),
  ('uw-40', 'un-4a-3', 'w-bread', 4), ('uw-41', 'un-4a-3', 'w-milk', 5), ('uw-42', 'un-4a-3', 'w-egg', 6),
  ('uw-43', 'un-7a-1', 'w-environment', 1), ('uw-44', 'un-7a-1', 'w-protect', 2), ('uw-45', 'un-7a-1', 'w-pollution', 3),
  ('uw-46', 'un-7a-1', 'w-recycle', 4), ('uw-47', 'un-7a-1', 'w-energy', 5), ('uw-48', 'un-7a-1', 'w-planet', 6),
  ('uw-49', 'un-7a-2', 'w-journey', 1), ('uw-50', 'un-7a-2', 'w-discover', 2), ('uw-51', 'un-7a-2', 'w-culture', 3),
  ('uw-52', 'un-7a-2', 'w-ancient', 4), ('uw-53', 'un-7a-2', 'w-modern', 5), ('uw-54', 'un-7a-2', 'w-tradition', 6),
  ('uw-55', 'un-7a-3', 'w-communicate', 1), ('uw-56', 'un-7a-3', 'w-language', 2), ('uw-57', 'un-7a-3', 'w-meaning', 3),
  ('uw-58', 'un-7a-3', 'w-express', 4), ('uw-59', 'un-7a-3', 'w-discuss', 5), ('uw-60', 'un-7a-3', 'w-opinion', 6);

INSERT INTO word_image (id, word_id, image_url, r2_key, upload_method, status, reviewed_at) VALUES
  ('img-apple', 'w-apple', '/seed-images/apple.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-book', 'w-book', '/seed-images/book.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-cat', 'w-cat', '/seed-images/cat.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-dog', 'w-dog', '/seed-images/dog.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-school', 'w-school', '/seed-images/school.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-water', 'w-water', '/seed-images/water.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-family', 'w-family', '/seed-images/family.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-teacher', 'w-teacher', '/seed-images/teacher.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-bird', 'w-bird', '/seed-images/bird.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-tree', 'w-tree', '/seed-images/tree.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-pen', 'w-pen', '/seed-images/pen.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('img-bag', 'w-bag', '/seed-images/bag.svg', NULL, 'seed', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- 掌握状态：部分已学、部分薄弱、部分到期。
INSERT INTO word_mastery (id, user_id, word_id, strength, next_review_time, last_review_time, consecutive_correct, consecutive_wrong, accuracy, is_weak, recent_results, total_attempts, correct_attempts, updated_at) VALUES
  ('m-1', 'u-student', 'w-apple', 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+12 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days'), 4, 0, 0.88, 0, '[1,1,1,0,1,1,1,1]', 8, 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
  ('m-2', 'u-student', 'w-banana', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days'), 1, 0, 0.66, 0, '[1,0,1]', 3, 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
  ('m-3', 'u-student', 'w-book', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'), 0, 2, 0.33, 1, '[0,1,0,0]', 4, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),
  ('m-4', 'u-student', 'w-cat', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes'), NULL, 0, 0, 0, 1, '[0,0]', 2, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 minutes')),
  ('m-5', 'u-student', 'w-dog', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+4 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days'), 3, 0, 0.9, 0, '[1,1,1,1,0,1,1,1,1,1]', 10, 9, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days')),
  ('m-6', 'u-student', 'w-school', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), 0, 1, 0.6, 1, '[1,1,0,0,1]', 5, 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
  ('m-7', 'u-student', 'w-water', 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+20 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days'), 5, 0, 0.95, 0, '[1,1,1,1,1,1]', 12, 11, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days')),
  ('m-8', 'u-student', 'w-family', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'), 1, 0, 0.5, 0, '[1,0]', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),
  ('m-9', 'u-student', 'w-teacher', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 hours'), NULL, 0, 0, 0, 0, '[]', 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 hours')),
  ('m-10', 'u-student', 'w-bird', 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+2 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'), 2, 0, 0.75, 0, '[1,0,1,1]', 4, 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days')),
  ('m-11', 'u-student', 'w-bag', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+6 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), 2, 0, 0.8, 0, '[1,1,1,1,0]', 5, 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days')),
  ('m-12', 'u-student', 'w-red', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes'), 0, 1, 0, 1, '[0]', 1, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-15 minutes')),
  ('m-13', 'u-student', 'w-good', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), 1, 0, 0.5, 0, '[1,0]', 2, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'));

-- 学习记录（最近 5 天，用于报告与日历）。
INSERT INTO practice_session (id, user_id, textbook_id, unit_id, mode, questions_json, start_time, end_time, total_count, correct_count, duration_ms) VALUES
  ('s-today-1', 'u-student', 'tb-3a', 'un-3a-1', 'unit', '[]', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-48 minutes'), 8, 6, 720000),
  ('s-yday-1', 'u-student', 'tb-3a', 'un-3a-2', 'unit', '[]', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-4 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-3 hours', '-50 minutes'), 8, 7, 600000),
  ('s-d2-1', 'u-student', 'tb-3a', 'un-3a-1', 'review', '[]', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days', '-5 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days', '-4 hours', '-52 minutes'), 6, 4, 480000),
  ('s-d3-1', 'u-student', 'tb-3a', 'un-3a-3', 'unit', '[]', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-6 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-5 hours', '-45 minutes'), 8, 5, 900000),
  ('s-d5-1', 'u-student', 'tb-3a', 'un-3a-2', 'review', '[]', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days', '-7 hours'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days', '-6 hours', '-55 minutes'), 6, 5, 300000);

INSERT INTO practice_record (id, session_id, question_id, word_id, question_type, prompt, correct_answer, user_answer, is_correct, duration, answered_at) VALUES
  ('r-1', 's-today-1', NULL, 'w-apple', 'definition_choice', '苹果', 'apple', 'apple', 1, 4200, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 hours')),
  ('r-2', 's-today-1', NULL, 'w-banana', 'letter_fill', 'b _ n _ n _', 'banana', 'banana', 1, 6800, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-58 minutes')),
  ('r-3', 's-today-1', NULL, 'w-book', 'sentence_fill', 'This is my English ____.', 'book', 'book', 1, 5100, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-56 minutes')),
  ('r-4', 's-today-1', NULL, 'w-cat', 'image_choice', '看图选择正确的单词', 'cat', 'dog', 0, 3000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-54 minutes')),
  ('r-5', 's-today-1', NULL, 'w-dog', 'definition_choice', '狗', 'dog', 'dog', 1, 3100, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-53 minutes')),
  ('r-6', 's-today-1', NULL, 'w-school', 'letter_fill', 's _ h _ o _', 'school', 'schol', 0, 9000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-52 minutes')),
  ('r-7', 's-today-1', NULL, 'w-apple', 'sentence_fill', 'I eat an ____ every day.', 'apple', 'apple', 1, 3500, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-51 minutes')),
  ('r-8', 's-today-1', NULL, 'w-cat', 'definition_choice', '猫', 'cat', 'cap', 0, 2200, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours', '-49 minutes')),
  ('r-9', 's-yday-1', NULL, 'w-water', 'definition_choice', '水', 'water', 'water', 1, 2900, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-4 hours')),
  ('r-10', 's-yday-1', NULL, 'w-family', 'sentence_fill', 'I love my ____.', 'family', 'family', 1, 4100, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-3 hours', '-58 minutes')),
  ('r-11', 's-yday-1', NULL, 'w-teacher', 'letter_fill', 't _ a _ h _ r', 'teacher', 'teacher', 1, 9000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-3 hours', '-56 minutes')),
  ('r-12', 's-yday-1', NULL, 'w-bird', 'image_choice', '看图选择正确的单词', 'bird', 'bird', 1, 3300, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-3 hours', '-55 minutes')),
  ('r-13', 's-yday-1', NULL, 'w-tree', 'definition_choice', '树', 'tree', 'three', 0, 7700, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-3 hours', '-54 minutes')),
  ('r-14', 's-yday-1', NULL, 'w-pen', 'sentence_fill', 'May I use your ____?', 'pen', 'pen', 1, 4000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-3 hours', '-53 minutes')),
  ('r-15', 's-yday-1', NULL, 'w-family', 'definition_choice', '家庭；家人', 'family', 'family', 1, 2600, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-3 hours', '-52 minutes')),
  ('r-16', 's-yday-1', NULL, 'w-water', 'letter_fill', 'w _ t _ r', 'water', 'water', 1, 3400, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days', '-3 hours', '-51 minutes')),
  ('r-17', 's-d2-1', NULL, 'w-book', 'definition_choice', '书；书本', 'book', 'look', 0, 2200, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days', '-5 hours')),
  ('r-18', 's-d2-1', NULL, 'w-banana', 'letter_fill', 'b _ n _ n _', 'banana', 'banana', 1, 7000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days', '-4 hours', '-58 minutes')),
  ('r-19', 's-d2-1', NULL, 'w-cat', 'image_choice', '看图选择正确的单词', 'cat', 'cat', 1, 2800, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days', '-4 hours', '-57 minutes')),
  ('r-20', 's-d2-1', NULL, 'w-school', 'sentence_fill', 'We go to ____ by bus.', 'school', 'school', 1, 5100, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days', '-4 hours', '-55 minutes')),
  ('r-21', 's-d2-1', NULL, 'w-dog', 'definition_choice', '狗', 'dog', 'dig', 0, 2400, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days', '-4 hours', '-54 minutes')),
  ('r-22', 's-d2-1', NULL, 'w-apple', 'letter_fill', 'a _ p _ e', 'apple', 'apple', 1, 3900, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days', '-4 hours', '-53 minutes')),
  ('r-23', 's-d3-1', NULL, 'w-bag', 'definition_choice', '包；书包', 'bag', 'bag', 1, 2100, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-6 hours')),
  ('r-24', 's-d3-1', NULL, 'w-ruler', 'letter_fill', 'r _ l _ r', 'ruler', 'ruler', 1, 5000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-5 hours', '-58 minutes')),
  ('r-25', 's-d3-1', NULL, 'w-red', 'definition_choice', '红色的', 'red', 'read', 0, 3100, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-5 hours', '-56 minutes')),
  ('r-26', 's-d3-1', NULL, 'w-blue', 'sentence_fill', 'The sky is ____ today.', 'blue', 'blue', 1, 4400, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-5 hours', '-55 minutes')),
  ('r-27', 's-d3-1', NULL, 'w-green', 'image_choice', '看图选择正确的单词', 'green', 'green', 1, 3300, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-5 hours', '-53 minutes')),
  ('r-28', 's-d3-1', NULL, 'w-pencil', 'letter_fill', 'p _ n _ i l', 'pencil', 'pencel', 0, 8900, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-5 hours', '-52 minutes')),
  ('r-29', 's-d3-1', NULL, 'w-bag', 'definition_choice', '包；书包', 'bag', 'bag', 1, 2000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-5 hours', '-50 minutes')),
  ('r-30', 's-d3-1', NULL, 'w-red', 'letter_fill', 'r _ d', 'red', 'red', 1, 2600, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 days', '-5 hours', '-49 minutes')),
  ('r-31', 's-d5-1', NULL, 'w-water', 'definition_choice', '水', 'water', 'water', 1, 2300, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days', '-7 hours')),
  ('r-32', 's-d5-1', NULL, 'w-family', 'letter_fill', 'f _ m _ l y', 'family', 'famly', 0, 7000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days', '-6 hours', '-58 minutes')),
  ('r-33', 's-d5-1', NULL, 'w-teacher', 'sentence_fill', 'Our ____ is very kind.', 'teacher', 'teacher', 1, 4200, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days', '-6 hours', '-57 minutes')),
  ('r-34', 's-d5-1', NULL, 'w-bird', 'image_choice', '看图选择正确的单词', 'bird', 'bird', 1, 2700, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days', '-6 hours', '-56 minutes')),
  ('r-35', 's-d5-1', NULL, 'w-tree', 'definition_choice', '树', 'tree', 'tree', 1, 2300, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days', '-6 hours', '-55 minutes')),
  ('r-36', 's-d5-1', NULL, 'w-pen', 'letter_fill', 'p _ n', 'pen', 'pen', 1, 2000, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days', '-6 hours', '-54 minutes'));

INSERT INTO incentive_rule (id, family_id, trigger_type, trigger_params, reward_description, enabled) VALUES
  ('rule-1', 'f-1', 'daily_accuracy', '{"minAnswers":10,"accuracy":85}', '周末多玩 30 分钟', 1),
  ('rule-2', 'f-1', 'streak_days', '{"days":5}', '挑选一本新的课外书', 1),
  ('rule-3', 'f-1', 'unit_complete', '{"unitId":"un-3a-1","unitName":"Unit 1  Hello!","minStrength":1}', '周五晚上一起看电影', 1),
  ('rule-4', 'f-1', 'weekly_wrong_lt', '{"minAnswers":20,"wrongLimit":5}', '周日晚饭选一道喜欢的菜', 0);

INSERT INTO incentive_event (id, family_id, student_user_id, rule_id, trigger_type, trigger_params, reward_description, period_key, triggered_at, status, confirmed_at, redeemed_at, note) VALUES
  ('ev-1', 'f-1', 'u-student', 'rule-1', 'daily_accuracy', '{"minAnswers":10,"accuracy":85}', '周末多玩 30 分钟', 'day:2026-10-28', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 days'), 'redeemed', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-4 days'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), '周六下午兑现'),
  ('ev-2', 'f-1', 'u-student', 'rule-2', 'streak_days', '{"days":5}', '挑选一本新的课外书', 'streak:5', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'), 'pending_redeem', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-20 hours'), NULL, '已确认，等周末去书店'),
  ('ev-3', 'f-1', 'u-student', 'rule-3', 'unit_complete', '{"unitId":"un-3a-1","unitName":"Unit 1  Hello!","minStrength":1}', '周五晚上一起看电影', 'unit:un-3a-1', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 hours'), 'pending_confirm', NULL, NULL, NULL);
