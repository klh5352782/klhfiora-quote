import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import loadable from '@loadable/component';

import { css } from 'linaria';
import xss from '@fiora/utils/xss';
import compressImage from '@fiora/utils/compressImage';
import config from '@fiora/config/client';
import { isMobile } from '@fiora/utils/ua';
import fetch from '../../utils/fetch';
import voice from '../../utils/voice';
import readDiskFile, { ReadFileResult } from '../../utils/readDiskFile';
import uploadFile from '../../utils/uploadFile';
import getRandomHuaji from '../../utils/getRandomHuaji';
import Style from './ChatInput.less';
import useIsLogin from '../../hooks/useIsLogin';
import useAction from '../../hooks/useAction';
import Dropdown from '../../components/Dropdown';
import IconButton from '../../components/IconButton';
import Avatar from '../../components/Avatar';
import Message from '../../components/Message';
import { Menu, MenuItem } from '../../components/Menu';
import { State } from '../../state/reducer';
import { sendMessage } from '../../service';
import Tooltip from '../../components/Tooltip';
import useAero from '../../hooks/useAero';

const expressionList = css`
    display: flex;
    width: 100%;
    height: 80px;
    position: absolute;
    left: 0;
    top: -80px;
    background-color: inherit;
    overflow-x: auto;
`;
const expressionImageContainer = css`
    min-width: 80px;
    height: 80px;
`;
const expressionImage = css`
    width: 100%;
    height: 100%;
    object-fit: cover;
`;

const ExpressionAsync = loadable(
    () =>
        // @ts-ignore
        import(/* webpackChunkName: "expression" */ './Expression'),
);
const CodeEditorAsync = loadable(
    // @ts-ignore
    () => import(/* webpackChunkName: "code-editor" */ './CodeEditor'),
);

let searchExpressionTimer: number = 0;
let inputIME = false;

// 引用功能的 props 接口
interface Props {
    quoteMessage?: any;
    setQuoteMessage?: (msg: any) => void;
}

function ChatInput({ quoteMessage, setQuoteMessage }: Props) {
    const action = useAction();
    const isLogin = useIsLogin();
    const connect = useSelector((state: State) => state.connect);
    const selfId = useSelector((state: State) => state.user?._id);
    const username = useSelector((state: State) => state.user?.username);
    const avatar = useSelector((state: State) => state.user?.avatar);
    const tag = useSelector((state: State) => state.user?.tag);
    const focus = useSelector((state: State) => state.focus);
    const linkman = useSelector((state: State) => state.linkmans[focus]);
    const selfVoiceSwitch = useSelector(
        (state: State) => state.status.selfVoiceSwitch,
    );
    const enableSearchExpression = useSelector(
        (state: State) => state.status.enableSearchExpression,
    );
    const [expressionDialog, toggleExpressionDialog] = useState(false);
    const [codeEditorDialog, toggleCodeEditorDialog] = useState(false);
    const [inputFocus, toggleInputFocus] = useState(false);
    const [at, setAt] = useState({ enable: false, content: '' });
    const $input = useRef<HTMLInputElement>(null);
    const aero = useAero();
    const [expressions, setExpressions] = useState<
        { image: string; width: number; height: number }[]
    >([]);

    // 当父组件传入引用消息时，自动将引用文本插入输入框光标处
    useEffect(() => {
        if (quoteMessage && $input.current) {
            const quoteText = `[引用]${quoteMessage.from?.username}: ${quoteMessage.content}[/引用]`;
            const input = $input.current as unknown as HTMLInputElement;
            if (input.selectionStart || input.selectionStart === 0) {
                const startPos = input.selectionStart;
                const endPos = input.selectionEnd;
                const restoreTop = input.scrollTop;
                input.value =
                    input.value.substring(0, startPos) +
                    quoteText +
                    input.value.substring(endPos, input.value.length);
                if (restoreTop > 0) input.scrollTop = restoreTop;
                input.focus();
                input.selectionStart = startPos + quoteText.length;
                input.selectionEnd = startPos + quoteText.length;
            } else {
                input.value += quoteText;
                input.focus();
            }
            // 清空引用状态，防止重复插入
            if (setQuoteMessage) setQuoteMessage(null);
        }
    }, [quoteMessage]);

    /** 全局输入框聚焦快捷键 */
    function focusInput(e: KeyboardEvent) {
        const $target: HTMLElement = e.target as HTMLElement;
        if (
            $target.tagName === 'INPUT' ||
            $target.tagName === 'TEXTAREA' ||
            e.key !== 'i'
        ) {
            return;
        }
        e.preventDefault();
        $input.current?.focus();
    }
    useEffect(() => {
        window.addEventListener('keydown', focusInput);
        return () => window.removeEventListener('keydown', focusInput);
    }, []);

    useEffect(() => {
        setExpressions([]);
    }, [enableSearchExpression]);

    if (!isLogin) {
        return (
            <div className={Style.chatInput}>
                <p className={Style.guest}>
                    游客朋友你好, 请
                    <b
                        className={Style.guestLogin}
                        onClick={() =>
                            action.setStatus('loginRegisterDialogVisible', true)
                        }
                        role="button"
                    >
                        登录
                    </b>
                    后参与聊天
                </p>
            </div>
        );
    }

    function insertAtCursor(value: string) {
        const input = $input.current as unknown as HTMLInputElement;
        if (input.selectionStart || input.selectionStart === 0) {
            const startPos = input.selectionStart;
            const endPos = input.selectionEnd;
            const restoreTop = input.scrollTop;
            input.value =
                input.value.substring(0, startPos) +
                value +
                input.value.substring(endPos as number, input.value.length);
            if (restoreTop > 0) {
                input.scrollTop = restoreTop;
            }
            input.focus();
            input.selectionStart = startPos + value.length;
            input.selectionEnd = startPos + value.length;
        } else {
            input.value += value;
            input.focus();
        }
    }

    function handleSelectExpression(expression: string) {
        toggleExpressionDialog(false);
        insertAtCursor(`#(${expression})`);
    }

    function addSelfMessage(type: string, content: string) {
        const _id = focus + Date.now();
        const message = {
            _id,
            type,
            content,
            createTime: Date.now(),
            from: {
                _id: selfId,
                username,
                avatar,
                tag,
            },
            loading: true,
            percent: type === 'image' || type === 'file' ? 0 : 100,
        };
        // @ts-ignore
        action.addLinkmanMessage(focus, message);

        if (selfVoiceSwitch && type === 'text') {
            const text = content
                .replace(
                    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&//=]*)/g,
                    '',
                )
                .replace(/#/g, '');

            if (text.length > 0 && text.length <= 100) {
                voice.push(text, Math.random().toString());
            }
        }

        return _id;
    }

    async function handleSendMessage(
        localId: string,
        type: string,
        content: string,
        linkmanId = focus,
        quote?: string,
    ) {
        if (linkman.unread > 0) {
            action.setLinkmanProperty(linkman._id, 'unread', 0);
        }
        const [error, message] = await sendMessage(linkmanId, type, content, quote);
        if (error) {
            action.deleteMessage(focus, localId, true);
        } else {
            message.loading = false;
            action.updateMessage(focus, localId, message);
        }
    }

    function sendImageMessage(image: string): void;
    function sendImageMessage(image: ReadFileResult): void;
    function sendImageMessage(image: string | ReadFileResult) {
        if (typeof image === 'string') {
            const id = addSelfMessage('image', image);
            handleSendMessage(id, 'image', image);
            toggleExpressionDialog(false);
            return;
        }

        if (image.length > config.maxImageSize) {
            Message.warning('要发送的图片过大', 3);
            return;
        }

        const ext = (image as any).type.split('/').pop().toLowerCase();
        const url = URL.createObjectURL((image as any).result);

        const img = new Image();
        img.onload = async () => {
            const id = addSelfMessage(
                'image',
                `${url}?width=${img.width}&height=${img.height}`,
            );
            try {
                const imageUrl = await uploadFile(
                    (image as any).result as Blob,
                    `ImageMessage/${selfId}_${Date.now()}.${ext}`,
                );
                handleSendMessage(
                    id,
                    'image',
                    `${imageUrl}?width=${img.width}&height=${img.height}`,
                    focus,
                );
            } catch (err) {
                console.error(err);
                Message.error('上传图片失败');
            }
        };
        img.src = url;
    }

    async function sendFileMessage(file: ReadFileResult) {
        if (file.length > config.maxFileSize) {
            Message.warning('要发送的文件过大', 3);
            return;
        }

        const id = addSelfMessage(
            'file',
            JSON.stringify({
                filename: file.filename,
                size: file.length,
                ext: file.ext,
            }),
        );
        try {
            const fileUrl = await uploadFile(
                file.result as Blob,
                `FileMessage/${selfId}_${Date.now()}.${file.ext}`,
            );
            handleSendMessage(
                id,
                'file',
                JSON.stringify({
                    fileUrl,
                    filename: file.filename,
                    size: file.length,
                    ext: file.ext,
                }),
                focus,
            );
        } catch (err) {
            console.error(err);
            Message.error('上传文件失败');
        }
    }

    async function handleSendImage() {
        if (!connect) {
            return Message.error('发送消息失败, 您当前处于离线状态');
        }
        const image = await readDiskFile(
            'blob',
            'image/png,image/jpeg,image/gif',
        );
        if (!image) {
            return null;
        }
        sendImageMessage(image);
        return null;
    }
    async function sendHuaji() {
        const huaji = getRandomHuaji();
        const id = addSelfMessage('image', huaji);
        handleSendMessage(id, 'image', huaji);
    }
    async function handleSendFile() {
        if (!connect) {
            Message.error('发送消息失败, 您当前处于离线状态');
            return;
        }
        const file = await readDiskFile('blob');
        if (!file) {
            return;
        }
        sendFileMessage(file);
    }

    function handleFeatureMenuClick({
        key,
        domEvent,
    }: {
        key: string;
        domEvent: any;
    }) {
        if (domEvent.keyCode === 13) {
            return;
        }

        switch (key) {
            case 'image': {
                handleSendImage();
                break;
            }
            case 'huaji': {
                sendHuaji();
                break;
            }
            case 'code': {
                toggleCodeEditorDialog(true);
                break;
            }
            case 'file': {
                handleSendFile();
                break;
            }
            default:
        }
    }

    async function handlePaste(e: any) {
        if (!connect) {
            e.preventDefault();
            return Message.error('发送消息失败, 您当前处于离线状态');
        }
        const { items, types } =
            e.clipboardData || e.originalEvent.clipboardData;

        if (types.indexOf('Files') > -1) {
            for (let index = 0; index < items.length; index++) {
                const item = items[index];
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onloadend = function handleLoad() {
                            const image = new Image();
                            image.onload = async () => {
                                const imageBlob = await compressImage(
                                    image,
                                    file.type,
                                    0.8,
                                );
                                sendImageMessage({
                                    filename: file.name,
                                    ext: imageBlob?.type.split('/').pop(),
                                    length: imageBlob?.size,
                                    type: imageBlob?.type,
                                    result: imageBlob,
                                } as any);
                            };
                            image.src = this.result as string;
                        };
                        reader.readAsDataURL(file);
                    }
                }
            }
            e.preventDefault();
        }
        return null;
    }

    function sendTextMessage() {
        if (!connect) {
            return Message.error('发送消息失败, 您当前处于离线状态');
        }

        const message = $input.current?.value.trim();
        if (!message || message.length === 0) {
            return null;
        }

        if (
            message.startsWith(window.location.origin) &&
            message.match(/\/invite\/group\/[\w\d]+/)
        ) {
            const groupId = message.replace(
                `${window.location.origin}/invite/group/`,
                '',
            );
            const id = addSelfMessage(
                'inviteV2',
                JSON.stringify({
                    inviter: selfId,
                    inviterName: username,
                    group: groupId,
                    groupName: '',
                }),
            );
            handleSendMessage(id, 'inviteV2', groupId);
        } else {
            const id = addSelfMessage('text', xss(message));
            handleSendMessage(id, 'text', message, focus, quoteMessage?._id);
            if (setQuoteMessage) setQuoteMessage(null);
        }

        if ($input.current) $input.current.value = '';
        setExpressions([]);
        return null;
    }

    async function getExpressionsFromContent() {
        if ($input.current) {
            const content = $input.current.value.trim();
            if (searchExpressionTimer) {
                clearTimeout(searchExpressionTimer);
            }
            searchExpressionTimer = setTimeout(async () => {
                if (content.length >= 1 && content.length <= 4) {
                    const [err, res] = await fetch(
                        'searchExpression',
                        { keywords: content, limit: 10 },
                        { toast: false },
                    );
                    if (!err && $input.current?.value.trim() === content) {
                        setExpressions(res);
                        return;
                    }
                }
                setExpressions([]);
            }, 500);
        }
    }

    async function handleInputKeyDown(e: any) {
        if (e.key === 'Tab') {
            e.preventDefault();
        } else if (e.key === 'Enter' && !inputIME) {
            sendTextMessage();
        } else if (e.altKey && (e.key === 's' || e.key === 'ß')) {
            sendHuaji();
            e.preventDefault();
        } else if (e.altKey && (e.key === 'd' || e.key === '∂')) {
            toggleExpressionDialog(true);
            e.preventDefault();
        } else if (e.key === '@') {
            if (!/@/.test($input.current?.value || '')) {
                setAt({
                    enable: true,
                    content: '',
                });
            }
        } else if (at.enable) {
            const { key } = e;
            setTimeout(() => {
                if (!/@/.test($input.current?.value || '')) {
                    setAt({ enable: false, content: '' });
                    return;
                }
                if (inputIME && key !== ' ') {
                    return;
                }
                if (!inputIME && key === ' ') {
                    setAt({ enable: false, content: '' });
                    return;
                }
                if (inputIME) {
                    return;
                }
                const regexResult = /@([^ ]*)/.exec($input.current?.value || '');
                if (regexResult) {
                    setAt({ enable: true, content: regexResult[1] });
                }
            }, 100);
        } else if (enableSearchExpression) {
            setTimeout(() => {
                if (inputIME) {
                    return;
                }
                if ($input.current?.value) {
                    getExpressionsFromContent();
                } else {
                    clearTimeout(searchExpressionTimer);
                    setExpressions([]);
                }
            });
        }
    }

    function getSuggestion() {
        if (!at.enable || linkman.type !== 'group') {
            return [];
        }
        return linkman.onlineMembers.filter((member: any) => {
            const regex = new RegExp(`^${at.content}`);
            if (regex.test(member.user.username)) {
                return true;
            }
            return false;
        });
    }

    function replaceAt(targetUsername: string) {
        if ($input.current) {
            $input.current.value = $input.current.value.replace(
                `@${at.content}`,
                `@${targetUsername} `,
            );
            setAt({
                enable: false,
                content: '',
            });
            $input.current.focus();
        }
    }

    function handleSendCode(language: string, rawCode: string) {
        if (!connect) {
            return Message.error('发送消息失败, 您当前处于离线状态');
        }

        if (rawCode === '') {
            return Message.warning('请输入内容');
        }

        const code = `@language=${language}@${rawCode}`;
        const id = addSelfMessage('code', code);
        handleSendMessage(id, 'code', code);
        toggleCodeEditorDialog(false);
        return null;
    }

    function handleClickExpressionImage(
        image: string,
        width: number,
        height: number,
    ) {
        sendImageMessage(`${image}?width=${width}&height=${height}`);
        setExpressions([]);
        if ($input.current) {
            $input.current.value = '';
        }
    }

    return (
        <div className={Style.chatInput} {...aero}>
            <Dropdown
                trigger={['click']}
                visible={expressionDialog}
                onVisibleChange={toggleExpressionDialog}
                overlay={
                    <div className={Style.expressionDropdown}>
                        <ExpressionAsync
                            onSelectText={handleSelectExpression}
                            onSelectImage={sendImageMessage}
                        />
                    </div>
                }
                animation="slide-up"
                placement="topLeft"
            >
                <IconButton
                    className={Style.iconButton}
                    width={44}
                    height={44}
                    icon="expression"
                    iconSize={32}
                />
            </Dropdown>
            <Dropdown
                trigger={['click']}
                overlay={
                    <div className={Style.featureDropdown}>
                        <Menu onClick={handleFeatureMenuClick}>
                            <MenuItem key="huaji">发送滑稽</MenuItem>
                            <MenuItem key="image">发送图片</MenuItem>
                            <MenuItem key="code">发送代码</MenuItem>
                            <MenuItem key="file">发送文件</MenuItem>
                        </Menu>
                    </div>
                }
                animation="slide-up"
                placement="topLeft"
            >
                <IconButton
                    className={Style.iconButton}
                    width={44}
                    height={44}
                    icon="feature"
                    iconSize={32}
                />
            </Dropdown>
            <form
                className={Style.form}
                autoComplete="off"
                onSubmit={(e) => e.preventDefault()}
            >
                <input
                    className={Style.input}
                    type="text"
                    placeholder="随便聊点啥吧, 不要无意义刷屏~~"
                    maxLength={2048}
                    ref={$input}
                    onKeyDown={handleInputKeyDown}
                    onPaste={handlePaste}
                    onCompositionStart={() => {
                        inputIME = true;
                    }}
                    onCompositionEnd={() => {
                        inputIME = false;
                    }}
                    onFocus={() => toggleInputFocus(true)}
                    onBlur={() => toggleInputFocus(false)}
                />

                {!isMobile && !inputFocus && (
                    <Tooltip
                        placement="top"
                        mouseEnterDelay={0.5}
                        overlay={
                            <span>
                                支持粘贴图片发图
                                <br />
                                全局按 i 键聚焦
                            </span>
                        }
                    >
                        <i className={`iconfont icon-about ${Style.tooltip}`} />
                    </Tooltip>
                )}
            </form>
            <IconButton
                className={Style.iconButton}
                width={44}
                height={44}
                icon="send"
                iconSize={32}
                onClick={sendTextMessage}
            />

            <div className={Style.atPanel}>
                {at.enable &&
                    getSuggestion().map((member: any) => (
                        <div
                            className={Style.atUserList}
                            key={member.user._id}
                            onClick={() => replaceAt(member.user.username)}
                            role="button"
                        >
                            <Avatar size={24} src={member.user.avatar} />
                            <p className={Style.atText}>
                                {member.user.username}
                            </p>
                        </div>
                    ))}
            </div>

            {codeEditorDialog && (
                <CodeEditorAsync
                    visible={codeEditorDialog}
                    onClose={() => toggleCodeEditorDialog(false)}
                    onSend={handleSendCode}
                />
            )}

            {expressions.length > 0 && (
                <div className={expressionList}>
                    {expressions.map(({ image, width, height }) => (
                        <div className={expressionImageContainer} key={image}>
                            <img
                                className={expressionImage}
                                src={image}
                                alt="表情图"
                                onClick={() =>
                                    handleClickExpressionImage(
                                        image,
                                        width,
                                        height,
                                    )
                                }
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ChatInput;