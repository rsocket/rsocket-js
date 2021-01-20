/**
 * @flow
 *
 * Spec: https://www.w3.org/TR/webrtc/
 * LastUpdated: 20170719
 *
 */

// https://www.w3.org/TR/webrtc/#idl-def-rtcofferansweroptions
declare type RTCOfferAnswerOptions = {
    voiceActivityDetection?: boolean,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcofferoptions
declare type RTCOfferOptions = {
    iceRestart?: boolean,
} & RTCOfferAnswerOptions;

// https://www.w3.org/TR/webrtc/#idl-def-rtcansweroptions
declare type RTCAnswerOptions = {
} & RTCOfferAnswerOptions;

// https://www.w3.org/TR/webrtc/#idl-def-rtcsdptype
declare type RTCSdpType = 'offer' | 'pranswer' | 'answer' | 'rollback';

// https://www.w3.org/TR/webrtc/#idl-def-rtcsessiondescriptioninit
declare type RTCSessionDescriptionInit = {
    type: RTCSdpType,
    sdp?: string,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcsessiondescription
declare class RTCSessionDescription {
    constructor(descriptionInitDict: RTCSessionDescriptionInit): void;
    /* RO */type: RTCSdpType;
    /* RO */sdp: string;
}

// https://www.w3.org/TR/webrtc/#dom-rtciceprotocol
declare type RTCIceProtocol = 'udp' | 'tcp';

// https://www.w3.org/TR/webrtc/#dom-rtcicecandidatetype
declare type RTCIceCandidateType = 'host' | 'srflx' | 'prflx' | 'relay';

// https://www.w3.org/TR/webrtc/#dom-rtcicetcpcandidatetype
declare type RTCIceTcpCandidateType = 'active' | 'passive' | 'so';

// https://www.w3.org/TR/webrtc/#idl-def-rtcicecandidateinit
declare type RTCIceCandidateInit = {
    candidate: string,
    sdpMid?: string,
    sdpMLineIndex?: number,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcicecandidate
declare class RTCIceCandidate {
    constructor(candidateInitDict: RTCIceCandidateInit): void;
    /* RO */candidate: string;
    /* RO */sdpMid?: string;
    /* RO */sdpMLineIndex?: number;
    /* RO */foundation?: string;
    /* RO */priority?: number;
    /* RO */ip?: string;
    /* RO */protocol?: RTCIceProtocol;
    /* RO */port?: number;
    /* RO */type?: RTCIceCandidateType;
    /* RO */tcpType?: RTCIceTcpCandidateType;
    /* RO */relatedAddress?: string;
    /* RO */relatedPort?: number;
    /* RO */ufrag?: string;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcicecandidatepair
declare type RTCIceCandidatePair = {
    local: RTCIceCandidate;
    remote: RTCIceCandidate;
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcsignalingstate
declare type RTCSignalingState = 'stable' | 'have-local-offer' | 'have-remote-offer' | 'have-local-pranswer' | 'have-remote-pranswer';

// https://www.w3.org/TR/webrtc/#idl-def-rtcicegatheringstate
declare type RTCIceGatheringState = 'new' | 'gathering' | 'complete';

// https://www.w3.org/TR/webrtc/#idl-def-rtciceconnectionstate
declare type RTCIceConnectionState = 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed';

// https://www.w3.org/TR/webrtc/#idl-def-rtcpeerconnectionstate
declare type RTCPeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

// https://www.w3.org/TR/webrtc/#idl-def-rtcicecredentialtype
declare type RTCIceCredentialType = 'password' | 'token';

// https://www.w3.org/TR/webrtc/#idl-def-rtciceserver
declare type RTCIceServer = {
    urls: string | string[],
    username?: string,
    credential?: string,
    credentialType?: RTCIceCredentialType,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcicetransportpolicy
declare type RTCIceTransportPolicy = 'relay' | 'all';

// https://www.w3.org/TR/webrtc/#idl-def-rtcbundlepolicy
declare type RTCBundlePolicy = 'balanced' | 'max-compat' | 'max-bundle';

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtcpmuxpolicy
declare type RTCRtcpMuxPolicy = 'negotiate' | 'require';

// https://www.w3.org/TR/webrtc/#idl-def-rtcicerole
declare type RTCIceRole = 'controlling' | 'controlled';

// https://www.w3.org/TR/webrtc/#idl-def-rtcicecomponent
declare type RTCIceComponent = 'RTP' | 'RTCP';

// https://www.w3.org/TR/webrtc/#idl-def-rtcicetransportstate
declare type RTCIceTransportState = 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed';

// https://www.w3.org/TR/webrtc/#idl-def-rtciceparameters
declare type RTCIceParameters = {
    usernameFragment: string,
    password: string,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcicetransport
declare class RTCIceTransport {
    /* RO */role: RTCIceRole;
    /* RO */component: RTCIceComponent;
    /* RO */state: RTCIceTransportState;
    /* RO */gatheringState: RTCIceGatheringState;
    getLocalCandidates(): RTCIceCandidate[];
    getRemoteCandidates(): RTCIceCandidate[];
    getSelectedCandidatePair(): RTCIceCandidatePair | null;
    getLocalParameters(): RTCIceParameters | null;
    getRemoteParameters(): RTCIceParameters | null;
    onstatechange: EventHandler;
    ongatheringstatechange: EventHandler;
    onselectedcandidatepairchange: EventHandler;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcdtlstransportstate
declare type RTCDtlsTransportState = 'new' | 'connecting' | 'connected' | 'closed' | 'failed';

// https://www.w3.org/TR/webrtc/#idl-def-rtcdtlstransport
declare class RTCDtlsTransport {
    /* RO */transport: RTCIceTransport;
    /* RO */state: RTCDtlsTransportState;
    getRemoteCertificates(): ArrayBuffer[];
    onstatechange: EventHandler;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpcodeccapability
declare type RTCRtpCodecCapability = {
    mimeType: string,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpheaderextensioncapability
declare type RTCRtpHeaderExtensionCapability = {
    uri: string,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpcapabilities
declare type RTCRtpCapabilities = {
    codecs: RTCRtpCodecCapability[],
    headerExtensions: RTCRtpHeaderExtensionCapability[],
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtprtxparameters
declare type RTCRtpRtxParameters = {
    ssrc: number,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpfecparameters
declare type RTCRtpFecParameters = {
    ssrc: number,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcdtxstatus
declare type RTCDtxStatus = 'disabled' | 'enabled';

// https://www.w3.org/TR/webrtc/#idl-def-rtcprioritytype
declare type RTCPriorityType = 'very-low' | 'low' | 'medium' | 'high';

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpencodingparameters
declare type RTCRtpEncodingParameters = {
    ssrc: number,
    rtx: RTCRtpRtxParameters,
    fec: RTCRtpFecParameters,
    dtx: RTCDtxStatus,
    active: boolean,
    priority: RTCPriorityType,
    maxBitrate: number,
    maxFramerate: number,
    rid: string,
    scaleResolutionDownBy?: number,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpheaderextensionparameters
declare type RTCRtpHeaderExtensionParameters = {
    uri: string,
    id: number,
    encrypted: boolean,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtcpparameters
declare type RTCRtcpParameters = {
    cname: string,
    reducedSize: boolean,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpcodecparameters
declare type RTCRtpCodecParameters = {
    payloadType: number,
    mimeType: string,
    clockRate: number,
    channels?: number,
    sdpFmtpLine: string,
};

declare type RTCDegradationPreference = 'maintain-framerate' | 'maintain-resolution' | 'balanced';

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpparameters
declare type RTCRtpParameters = {
    transactionId: string,
    encodings: RTCRtpEncodingParameters[],
    headerExtensions: RTCRtpHeaderExtensionParameters[],
    rtcp: RTCRtcpParameters,
    codecs: RTCRtpCodecParameters[],
    degradationPreference?: RTCDegradationPreference,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpcontributingsource
declare type RTCRtpContributingSource = {
    /* RO */timestamp: number,
    /* RO */source: number,
    /* RO */audioLevel?: number | null,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpsynchronizationsource
declare type RTCRtpSynchronizationSource = {
    /* RO */timestamp: number,
    /* RO */source: number,
    /* RO */audioLevel?: number,
    /* RO */voiceActivityFlag?: boolean | null,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpcapabilities
declare type RTCRtcCapabilities = {
    codecs: RTCRtpCodecCapability[],
    headerExtensions: RTCRtpHeaderExtensionCapability[],
};

// https://www.w3.org/TR/webrtc/#dom-rtcrtpsender
declare class RTCRtpSender {
    constructor(): void;
    /* RO */track?: MediaStreamTrack;
    /* RO */transport?: RTCDtlsTransport;
    /* RO */rtcpTransport?: RTCDtlsTransport;
    setParameters(parameters?: RTCRtpParameters): Promise<void>;
    getParameters(): RTCRtpParameters;
    replaceTrack(withTrack: MediaStreamTrack): Promise<void>;
    getStats(): Promise<RTCStatsReport>;
    static getCapabilities(kind: string): RTCRtpCapabilities;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtpreceiver
declare class RTCRtpReceiver {
    constructor(): void;
    /* RO */track?: MediaStreamTrack;
    /* RO */transport?: RTCDtlsTransport;
    /* RO */rtcpTransport?: RTCDtlsTransport;
    getParameters(): RTCRtpParameters;
    getContributingSources(): RTCRtpContributingSource[];
    getSynchronizationSources(): RTCRtpSynchronizationSource[];
    getStats(): Promise<RTCStatsReport>;
    static getCapabilities(kind: string): RTCRtcCapabilities;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtptransceiverdirection
declare type RTCRtpTransceiverDirection = 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive';

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtptransceiver
declare class RTCRtpTransceiver {
    /* RO */mid: string | null;
    /* RO */sender: RTCRtpSender;
    /* RO */receiver: RTCRtpReceiver;
    /* RO */stopped: boolean;
    /* RO */direction: RTCRtpTransceiverDirection;
    setDirection(direction: RTCRtpTransceiverDirection): void;
    stop(): void;
    setCodecPreferences(codecs: RTCRtpCodecCapability[]): void;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcrtptransceiverinit
declare type RTCRtpTransceiverInit = {
    direction?: RTCRtpTransceiverDirection,
    streams: MediaStream[],
    sendEncodings: RTCRtpEncodingParameters[],
};

// https://www.w3.org/TR/webrtc/#dom-rtccertificate
declare class RTCCertificate {
    /* RO */expires: number;
    getAlgorithm(): string;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcconfiguration
declare type RTCConfiguration = {
    iceServers?: RTCIceServer[],
    iceTransportPolicy?: RTCIceTransportPolicy,
    bundlePolicy?: RTCBundlePolicy,
    rtcpMuxPolicy?: RTCRtcpMuxPolicy,
    peerIdentity?: string,
    certificates?: RTCCertificate[],
    iceCandidatePoolSize?: number,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcsctptransport
declare type RTCSctpTransport = {
    /* RO */transport: RTCDtlsTransport,
    /* RO */maxMessageSize: number,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcdatachannelinit
declare type RTCDataChannelInit = {
    ordered?: boolean,
    maxPacketLifeTime?: number,
    maxRetransmits?: number,
    protocol?: string,
    negotiated?: boolean,
    id?: number,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcdatachannelstate
declare type RTCDataChannelState = 'connecting' | 'open' | 'closing' | 'closed';

// https://www.w3.org/TR/websockets/#dom-websocket-binarytype
declare type RTCBinaryType = 'blob' | 'arraybuffer';

// https://www.w3.org/TR/webrtc/#idl-def-rtcdatachannel
declare class RTCDataChannel extends EventTarget {
    /* RO */label: string;
    /* RO */ordered: boolean;
    /* RO */maxPacketLifeTime: number | null;
    /* RO */maxRetransmits: number | null;
    /* RO */protocol: string;
    /* RO */negotiated: boolean;
    /* RO */id: number;
    /* RO */readyState: RTCDataChannelState;
    /* RO */bufferedAmount: number;
    bufferedAmountLowThreshold: number;
    binaryType: RTCBinaryType;
    close(): void;
    send(data: string | Blob | ArrayBuffer | $ArrayBufferView): void;
    onopen: EventHandler;
    onmessage: (event: MessageEvent) => void;
    onbufferedamountlow: EventHandler;
    onerror: (error: RTCErrorEvent) => void;
    onclose: EventHandler;
}

// https://www.w3.org/TR/webrtc/#h-rtctrackevent
declare class RTCTrackEvent extends Event {
    /* RO */receiver: RTCRtpReceiver;
    /* RO */track: MediaStreamTrack;
    /* RO */streams: MediaStream[];
    /* RO */transceiver: RTCRtpTransceiver;
}

// https://www.w3.org/TR/webrtc/#h-rtcpeerconnectioniceevent
declare class RTCPeerConnectionIceEvent extends Event {
    /* RO */candidate: RTCIceCandidate | null;
    /* RO */url: string;
}

// https://www.w3.org/TR/webrtc/#h-rtcpeerconnectioniceerrorevent
declare class RTCPeerConnectionIceErrorEvent extends Event {
    /* RO */hostCandidate: string;
    /* RO */url: string;
    /* RO */errorCode: number;
    /* RO */errorText: string;
}

// https://www.w3.org/TR/webrtc/#h-rtcdatachannelevent
declare class RTCDataChannelEvent extends Event {
    /* RO */channel: RTCDataChannel;
}

// https://www.w3.org/TR/webrtc/#h-rtcerrorevent
declare class RTCErrorEvent extends Event {
    error: RTCError | null;
}
declare class RTCError extends Error {}

// https://www.w3.org/TR/webrtc/#idl-def-rtcpeerconnection
declare class RTCPeerConnection extends EventTarget {
    constructor(configuration?: RTCConfiguration): RTCPeerConnection;
    /* RO */defaultIceServers: RTCIceServer[];

    createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit>;
    createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit>;

    setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
    /* RO */localDescription: RTCSessionDescription | null;
    /* RO */currentLocalDescription: RTCSessionDescription | null;
    /* RO */pendingLocalDescription: RTCSessionDescription | null;

    setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
    /* RO */remoteDescription: RTCSessionDescription | null;
    /* RO */currentRemoteDescription: RTCSessionDescription | null;
    /* RO */pendingRemoteDescription: RTCSessionDescription | null;

    addIceCandidate(candidate?: RTCIceCandidateInit | RTCIceCandidate): Promise<void>;

    /* RO */signalingState: RTCSignalingState;
    /* RO */iceGatheringState: RTCIceGatheringState;
    /* RO */iceConnectionState: RTCIceConnectionState;
    /* RO */connectionState: RTCPeerConnectionState;
    /* RO */canTrickleIceCandidates?: boolean | null;

    getConfiguration(): RTCConfiguration;
    setConfiguration(configuration: RTCConfiguration): void;
    close(): void;

    onnegotiationneeded: EventHandler;
    onicecandidate: (event: RTCPeerConnectionIceEvent) => void;
    onicecandidateerror: (event: RTCPeerConnectionIceErrorEvent) => void;
    onsignalingstatechange: EventHandler;
    oniceconnectionstatechange: EventHandler;
    onicegatheringstatechange: EventHandler;
    onconnectionstatechange: EventHandler;
    onisolationchange: EventHandler;
    onfingerprintfailure: EventHandler;

    // Extension: https://www.w3.org/TR/webrtc/#h-rtcpeerconnection-interface-extensions
    getSenders(): RTCRtpSender[];
    getReceivers(): RTCRtpReceiver[];
    getTransceivers(): RTCRtpTransceiver[];
    addTrack(track: MediaStreamTrack, ...streams: MediaStream[]): RTCRtpSender;
    removeTrack(sender: RTCRtpSender): void;
    addTransceiver(trackOrKind: MediaStreamTrack | string, init?: RTCRtpTransceiverInit): RTCRtpTransceiver;
    ontrack: (event: RTCTrackEvent) => void;

    // Extension: https://www.w3.org/TR/webrtc/#h-rtcpeerconnection-interface-extensions-1
    /* RO */sctp: RTCSctpTransport | null;
    createDataChannel(label: string | null, dataChannelDict?: RTCDataChannelInit): RTCDataChannel;
    ondatachannel: (event: RTCDataChannelEvent) => void;

    // Extension: https://www.w3.org/TR/webrtc/#h-rtcpeerconnection-interface-extensions-2
    getStats(selector?: MediaStreamTrack | null): Promise<RTCStatsReport>;

    // Extension: https://www.w3.org/TR/webrtc/#sec.cert-mgmt
    static generateCertificate(keygenAlgorithm: string): Promise<RTCCertificate>;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcstatsreport
declare class RTCStatsReport {
    // @@iterator(): Iterator<[string, RTCStats]>;
    entries(): Iterator<[string, RTCStats]>;
    forEach(callbackfn: (value: RTCStats, index: string, map: Map<string, RTCStats>) => mixed, thisArg?: any): void;
    get(key: string): RTCStats | void;
    has(key: string): boolean;
    keys(): Iterator<string>;
    values(): Iterator<RTCStats>;
    size: number;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcstats
declare type RTCStats = {
    timestamp: number,
    type: RTCStatsType,
    id: string,
};

// https://www.w3.org/TR/webrtc/#idl-def-rtcstatstype
declare type RTCStatsType = "codec" | "inbound-rtp" | "outbound-rtp" | "peer-connection" | "data-channel" | "track" | "transport" | "candidate-pair" | "local-candidate" | "remote-candidate" | "certificate";

// https://www.w3.org/TR/webrtc/#idl-def-rtcdtmfsender
declare class RTCDTMFSender extends EventTarget {
    /* RO */toneBuffer: string;
    insertDTMF(tones: string, duration?: number, interToneGap?: number): void;
    ontonechange: (event: RTCDTMFToneChangeEvent) => void;
}

// https://www.w3.org/TR/webrtc/#idl-def-rtcdtmftonechangeeventinit
declare class RTCDTMFToneChangeEvent extends Event {
    tone: string;
}