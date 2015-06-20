import { AudioServer } from '../AudioServer';

export class WebAudioServer extends AudioServer {

    static create( {

        channelCount = 1,

        sampleCountPerCallback = 2048

    } = { } ) {

        return new Promise( ( resolve, reject ) => {

            let context = null;
            let node = null;

            try {
                context = new AudioContext( );
            } catch ( error ) { try {
                context = new webkitAudioContext( );
            } catch ( e ) {
                return reject( new Error( 'Cannot initialize context' ) );
            } }

            try {
                node = context.createScriptProcessor( sampleCountPerCallback, 0, channelCount );
                node.connect( context.destination );
            } catch ( e ) { try {
                node = context.createJavascriptNode( sampleCountPerCallback, 0, channelCount );
                node.connect( context.destination );
            } catch ( e ) {
                return reject( new Error( 'Cannot initialize audio node' ) );
            } }

            return resolve( new WebAudioServer( Object.assign( { }, arguments[ 0 ], {

                webAudioContext : context,
                webAudioNode : node,

                outputSampleRate : context.sampleRate,

                channelCount : channelCount,

                sampleCountPerCallback : sampleCountPerCallback

            } ) ) );

        } );

    }

    constructor( options ) {

        super( options ); let {

            webAudioContext,
            webAudioNode

        } = options;

        this.webAudioContext = null;
        this.webAudioNode = null;

        this.webAudioListener = null;

        this.attachWebAudioApi( webAudioContext, webAudioNode );

    }

    attachWebAudioApi( context, node ) {

        this.webAudioContext = context;
        this.webAudioNode = node;

        this.webAudioNode.addEventListener( 'audioprocess', this.webAudioListener = ( e => {

            let buffers = new Array( this.channelCount );

            for ( let t = 0; t < buffers.length; ++ t )
                buffers[ t ] = e.outputBuffer.getChannelData( t );

            this._refillResampleBuffer( );

            let written = 0;

            for ( ; written < this.sampleCountPerCallback && this.resampleBufferStart !== this.resampleBufferEnd; ++ written ) {

                for ( let t = 0; t < this.channelCount; ++ t )
                    buffers[ t ][ written ] = this.resampleBuffer[ this.resampleBufferStart ++ ] * this.volume;

                if ( this.resampleBufferStart === this.resampleBufferSize ) {
                    this.resampleBufferStart = 0;
                }

            }

            for ( ; written < this.sampleCountPerCallback; ++ written ) {

                for ( let t = 0; t < this.channelCount; ++ t ) {
                    buffers[ t ][ written ] = 0;
                }

            }

        } ).bind( this ) );

    }

    detachWebAudioApi( ) {

        if ( this.webAudioNode )
            this.webAudioNode.removeEventListener( 'audioprocess', this.webAudioListener );

        this.webAudioContext = null;
        this.webAudioNode = null;
        this.webAudioListener = null;

    }

    writeAudio( samples ) {

        this.writeAudioNoCallback( samples );
        this.executeCallback( );

    }

    writeAudioNoCallback( samples ) {

        let t = 0;

        if ( this.formatCallback ) {

            while ( t < samples.length && this.audioBufferSize < this.maxBufferSize ) {
                this.audioBuffer[ this.audioBufferSize ++ ] = this.formatCallback( samples[ t ++ ] );
            }

        } else {

            while ( t < samples.length && this.audioBufferSize < this.maxBufferSize ) {
                this.audioBuffer[ this.audioBufferSize ++ ] = samples[ t ++ ];
            }

        }

    }

    remainingBuffer( ) {

        let resampledSamplesLeft = ( this.resampleBufferStart <= this.resampleBufferEnd ? 0 : this.resampleBufferSize ) + this.resampleBufferEnd - this.resampleBufferStart;

        return Math.floor( resampledSamplesLeft * this.resampleControl.ratioWeight / this.channelCount ) * this.channelCount + this.audioBufferSize;

    }

    executeCallback( ) {

        if ( ! this.underrunCallback )
            return ;

        let requestedSampleCount = this.minBufferSize - this.remainingBuffer( );

        if ( requestedSampleCount === 0 )
            return ;

        this.writeAudioNoCallback( this.underrunCallback( requestedSampleCount ) );

    }

}
