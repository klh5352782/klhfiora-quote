import React from 'react';

import expressions from '@fiora/utils/expressions';
import { TRANSPARENT_IMAGE } from '@fiora/utils/const';
import Style from './Message.less';

interface TextMessageProps {
    content: string;
}

function TextMessage(props: TextMessageProps) {
    let content = props.content;

    // ===== 引用样式处理 =====
    // 将 [引用]...[/引用] 替换为带有特殊背景的 span
    content = content.replace(
        /\[引用\]([\s\S]*?)\[\/引用\]/g,
        '<span style="background:#f0f0f0;border-left:3px solid #1890ff;padding:2px 8px;margin-right:8px;display:inline-block;border-radius:4px;">$1</span>'
    );

    // ===== 原有的 URL 识别与链接化 =====
    content = content.replace(
        /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}(\.[a-z]{2,6})?\b(:[0-9]{2,5})?([-a-zA-Z0-9@:%_+.~#?&//=]*)/g,
        (r) =>
            `<a class="${Style.selecteAble}" href="${r}" rel="noopener noreferrer" target="_blank">${r}</a>`,
    );

    // ===== 原有的表情图片替换 =====
    content = content.replace(/#\(([\u4e00-\u9fa5a-z]+)\)/g, (r, e) => {
        const index = expressions.default.indexOf(e);
        if (index !== -1) {
            return `<img class="${Style.baidu} ${
                Style.selecteAble
            }" src="${TRANSPARENT_IMAGE}" style="background-position: left ${-30 *
                index}px;" onerror="this.style.display='none'" alt="${r}">`;
        }
        return r;
    });

    return (
        <div
            className={Style.textMessage}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: content }}
        />
    );
}

export default TextMessage;