const axios = require('axios');
const querystring = require('querystring');
const cheerio = require('cheerio');
const program = require('commander').program;
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');

const getMyArticleList = async (cookie, type, sk) => {
    let po = 0;
    const myArticleList = [];

    while (true) {
        console.info(`${po + 1}번째 내 글 목록 리스트를 가져옵니다.`);
        let myArticleUrl = `https://www.clien.net/service/mypage/myArticle?&type=${type}&sk=${sk}&sv=&po=${po}`;
        const response = await axios.get(myArticleUrl, {
            headers: {
                'Cookie': cookie,
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'same-origin',
                'Sec-Fetch-User': '?1',
                'Upgrade-InSecure-Requests': '1',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"macOS"'
            }
        });
        console.log(`${po +1}번째 내 글 목록 리스트를 가져와서 필요한 내용을 추출합니다.`);

        const $ = cheerio.load(response.data);
        const subjectList = $('.list_subject');
        subjectList.each((index, element) => {
            console.log(`${element.attribs.title}: ${element.attribs.href}`);
            if (!element.attribs.title || !element.attribs.href) return;

            myArticleList.push({
                title: element.attribs.title,
                url: `https:/www.clien.net${element.attribs.href}`
            });
        });

        if (subjectList.length === 0) break;

        po++;
    }

    return myArticleList;
};

async function crawlPost(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const boardName = $('.board_head .board_name h2').text().trim();
        const category = $('.post_subject .post_category').text().trim();
        const title = $('.post_subject > span:not(.post_category)').text().trim();
        const createdAtRaw = $('.post_view .post_author span:first-child').text().trim();
        const createdAt = moment.tz(createdAtRaw, 'YYYY-MM-DD HH:mm:ss', 'Asia/Seoul').toISOString();
        const postId = url.split('/').pop()?.split('?')[0];

        let content = $('.post_view .post_content article').html();

        const directory = path.join('articles', boardName);
        const filePath = path.join(directory, `${postId}.json`);

        // 디렉토리 생성
        fs.mkdirSync(directory, { recursive: true });

        // 이미지 다운로드 및 저장
        const imageDirectory = path.join(directory, 'images');
        fs.mkdirSync(imageDirectory, { recursive: true });

        const imageUrls = $('img', content)
            .map((_, img) => $(img).attr('src'))
            .get();

        for (const imageUrl of imageUrls) {
            // const imageFileName = path.basename(imageUrl).split('?')[0];
            const imagePath = path.join(directory, 'images', imageUrl.replace('https://edgio.clien.net', '')).split('?')[0];
            const imageDirectory = path.dirname(imagePath);
            fs.mkdirSync(imageDirectory, { recursive: true });

            const imageResponse = await axios.get(imageUrl, { responseType: 'stream' });
            imageResponse.data.pipe(fs.createWriteStream(imagePath));

            // 콘텐츠의 이미지 경로 변경
            if (content) {
                content = content.replace(imageUrl, imagePath.replace(directory, '').replace(/\\/g, '/'));
            }
        }

        const postData = {
            boardName,
            category,
            title,
            createdAt,
            postId,
            content,
        };

        // JSON 파일 생성
        fs.writeFileSync(filePath, JSON.stringify(postData, null, 2));

        console.log(`게시물 저장 완료: ${filePath}`);
    } catch (error) {
        if (error instanceof Error) {
            console.error(`크롤링 에러: ${error.message}`);
        }
    }
}

const login = async (userId, userPassword) => {
    let response = await axios.get('https://www.clien.net/service', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"macOS"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        }
    });
    const clienCookie = new Map();
    let cookies = response.headers.get('Set-Cookie');
    if (cookies) {
        cookies.map(cookie => cookie.split(';')[0])
            .forEach(cookie => clienCookie.set(cookie.split('=')[0], cookie.split('=')[1]));
    }

    console.log(clienCookie);
    const csrf = response.data.match(/<input type="hidden" name="_csrf" value="(.+?)"/)[1];

    try {
        response = await axios.post('https://www.clien.net/service/login', querystring.stringify({
            userId: userId,
            userPassword: userPassword,
            _csrf: csrf,
            deviceId: null,
            totpcode: null
        }), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": Array.from(clienCookie.keys()).map(key => `${key}=${clienCookie.get(key)}`).join('; '),
                "Origin": "https://www.clien.net",
                "Referer": "https://www.clien.net/service/",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requested": "1",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                "sec-ch-ua": '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": '"macOS"'
            }
        });

        console.log(response.status)
        console.log(response.headers)
        console.log(response.data);

        let cookies = response.headers.get('Set-Cookie');
        if (cookies) {
            cookies.map(cookie => cookie.split(';')[0])
                .forEach(cookie => clienCookie.set(cookie.split('=')[0], cookie.split('=')[1]));
        }
        console.log(clienCookie);

        console.log(`로그인 성공`);

    } catch (e) {
        console.log(e.response.status)
        console.error(e.response.headers)
    }

    return clienCookie;
}

const backupMyArticle = async (clienCookie) => {
    const myArticleList = await getMyArticleList(Array.from(clienCookie.keys()).map(key => `${key}=${clienCookie.get(key)}`).join('; '), 'articles', 'title');
    const myCommentList = await getMyArticleList(Array.from(clienCookie.keys()).map(key => `${key}=${clienCookie.get(key)}`).join('; '), 'comments', 'undefined');

    console.log(myArticleList);
    console.log(myCommentList);

    myArticleList.forEach((article) => {
        crawlPost(article.url);
    });

    myCommentList.forEach((comment) => {
        crawlPost(comment.url);
    })
};

login().then(() => {
    console.log('done');
});

program
    .command('backup')
    .description('내가 클리앙에 쓴 글, 댓글 백업')
    .option('--userId <userId>', '클리앙 아이디')
    .option('--userPassword <userPassword>', '클리앙 비밀번호')
    .action(async options => {
        const { userId, userPassword } = options;

        if (!userId || !userPassword) {
            console.error('USAGE: node app.js backup --userId <userId> --userPassword <userPassword>');
            process.exit(0);
        }

        const clienCookie = await login(userId, userPassword);
        await backupMyArticle(clienCookie);
    })

program.parse(process.argv);