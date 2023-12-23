import { IToken } from 'chevrotain';
import { autoBindMethods } from 'class-autobind-decorator';
import uniqBy from 'lodash.uniqby';
import {
  StardogSparqlParser,
  W3SpecSparqlParser,
  sparqlKeywords,
  isCstNode,
  traverse,
} from 'millan';
import {
  ARBITRARILY_LARGE_NUMBER,
  AbstractLanguageServer,
  CompletionCandidate,
  LSPExtensionMethod,
  SparqlCompletionData,
  abbreviatePrefixObj,
  errorMessageProvider,
  getCommonCompletionItemsGivenNamespaces,
  getUniqueIdentifiers,
  isIriRef,
  isLocalName,
  isPrefix,
  isVar,
  makeCompletionItemFromPrefixedNameAndNamespaceIri,
  namespaceArrayToObj,
  regexPatternToString,
} from 'stardog-language-utils';
import {
  CompletionItem,
  CompletionItemKind,
  FoldingRangeRequestParam,
  Hover,
  IConnection,
  InitializeParams,
  InitializeResult,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  TextDocumentPositionParams,
  TextEdit,
} from 'vscode-languageserver';

@autoBindMethods
export class SparqlLanguageServer extends AbstractLanguageServer<
  StardogSparqlParser | W3SpecSparqlParser
> {
  protected parser: StardogSparqlParser | W3SpecSparqlParser;
  private namespaceMap = {};
  private relationshipBindings = [];
  private relationshipCompletionItems = [];
  private typeBindings = [];
  private typeCompletionItems = [];
  private bfoMappings = {
    'bfo:BFO_0000054': 'has realization',
    'bfo:BFO_0000055': 'realizes',
    'bfo:BFO_0000056': 'participates in at some time',
    'bfo:BFO_0000057': 'has participant at some time',
    'bfo:BFO_0000058': 'is concretized by at some time',
    'bfo:BFO_0000059': 'concretizes at some time',
    'bfo:BFO_0000062': 'preceded by',
    'bfo:BFO_0000063': 'precedes',
    'bfo:BFO_0000066': 'occurs in',
    'bfo:BFO_0000082': 'located in at all times',
    'bfo:BFO_0000084': 'generically depends on at some time',
    'bfo:BFO_0000101': 'is carrier of at some time',
    'bfo:BFO_0000108': 'exists at',
    'bfo:BFO_0000110': 'has continuant part at all times',
    'bfo:BFO_0000111': 'has proper continuant part at all times',
    'bfo:BFO_0000113': 'has material basis at all times',
    'bfo:BFO_0000115': 'has member part at some time',
    'bfo:BFO_0000117': 'has occurrent part',
    'bfo:BFO_0000118': 'has proper occurrent part',
    'bfo:BFO_0000121': 'has temporal part',
    'bfo:BFO_0000124': 'location of at some time',
    'bfo:BFO_0000127': 'material basis of at some time',
    'bfo:BFO_0000129': 'member part of at some time',
    'bfo:BFO_0000132': 'occurrent part of',
    'bfo:BFO_0000136': 'proper temporal part of',
    'bfo:BFO_0000137': 'proper continuant part of at all times',
    'bfo:BFO_0000138': 'proper occurrent part of',
    'bfo:BFO_0000139': 'temporal part of',
    'bfo:BFO_0000153': 'temporally projects onto',
    'bfo:BFO_0000163': 'material basis of at all times',
    'bfo:BFO_0000164': 'concretizes at all times',
    'bfo:BFO_0000165': 'is concretized by at all times',
    'bfo:BFO_0000166': 'participates in at all times',
    'bfo:BFO_0000167': 'has participant at all times',
    'bfo:BFO_0000170': 'location of at all times',
    'bfo:BFO_0000171': 'located in at some time',
    'bfo:BFO_0000172': 'has member part at all times',
    'bfo:BFO_0000173': 'member part of at all times',
    'bfo:BFO_0000174': 'has proper continuant part at some time',
    'bfo:BFO_0000175': 'proper continuant part of at some time',
    'bfo:BFO_0000176': 'continuant part of at some time',
    'bfo:BFO_0000177': 'continuant part of at all times',
    'bfo:BFO_0000178': 'has continuant part at some time',
    'bfo:BFO_0000181': 'has proper temporal part',
    'bfo:BFO_0000183': 'environs',
    'bfo:BFO_0000184': 'history of',
    'bfo:BFO_0000185': 'has history',
    'bfo:BFO_0000194': 'specifically depended on by',
    'bfo:BFO_0000195': 'specifically depends on',
    'bfo:BFO_0000196': 'bearer of',
    'bfo:BFO_0000197': 'inheres in',
    'bfo:BFO_0000199': 'occupies temporal region',
    'bfo:BFO_0000200': 'occupies spatiotemporal region',
    'bfo:BFO_0000210': 'occupies spatial region at some time',
    'bfo:BFO_0000211': 'occupies spatial region at all times',
    'bfo:BFO_0000216': 'spatially projects onto at some time',
    'bfo:BFO_0000217': 'spatially projects onto at all times',
    'bfo:BFO_0000218': 'has material basis at some time',
    'bfo:BFO_0000219': 'generically depends on at all times',
    'bfo:BFO_0000220': 'is carrier of at all times',
    'bfo:BFO_0000221': 'first instant of',
    'bfo:BFO_0000222': 'has first instant',
    'bfo:BFO_0000223': 'last instant of',
    'bfo:BFO_0000224': 'has last instant',
    'bfo:BFO_0000001': 'entity',
    'bfo:BFO_0000002': 'continuant',
    'bfo:BFO_0000003': 'occurrent',
    'bfo:BFO_0000004': 'independent continuant',
    'bfo:BFO_0000006': 'spatial region',
    'bfo:BFO_0000008': 'temporal region',
    'bfo:BFO_0000009': 'two-dimensional spatial region',
    'bfo:BFO_0000011': 'spatiotemporal region',
    'bfo:BFO_0000015': 'process',
    'bfo:BFO_0000016': 'disposition',
    'bfo:BFO_0000017': 'realizable entity',
    'bfo:BFO_0000018': 'zero-dimensional spatial region',
    'bfo:BFO_0000019': 'quality',
    'bfo:BFO_0000020': 'specifically dependent continuant',
    'bfo:BFO_0000023': 'role',
    'bfo:BFO_0000024': 'fiat object part',
    'bfo:BFO_0000026': 'one-dimensional spatial region',
    'bfo:BFO_0000027': 'object aggregate',
    'bfo:BFO_0000028': 'three-dimensional spatial region',
    'bfo:BFO_0000029': 'site',
    'bfo:BFO_0000030': 'object',
    'bfo:BFO_0000031': 'generically dependent continuant',
    'bfo:BFO_0000034': 'function',
    'bfo:BFO_0000035': 'process boundary',
    'bfo:BFO_0000038': 'one-dimensional temporal region',
    'bfo:BFO_0000040': 'material entity',
    'bfo:BFO_0000140': 'continuant fiat boundary',
    'bfo:BFO_0000141': 'immaterial entity',
    'bfo:BFO_0000142': 'fiat line',
    'bfo:BFO_0000145': 'relational quality',
    'bfo:BFO_0000146': 'fiat surface',
    'bfo:BFO_0000147': 'fiat point',
    'bfo:BFO_0000148': 'zero-dimensional temporal region',
    'bfo:BFO_0000182': 'history',
    'bfo:BFO_0000202': 'temporal interval',
    'bfo:BFO_0000203': 'temporal instant',
  };

  constructor(connection: IConnection) {
    // Unlike other servers, the Sparql server instantiates a different parser
    // depending on initialization params
    super(connection, null);
  }

  onInitialization(params: InitializeParams): InitializeResult {
    this.connection.onHover(this.handleHover.bind(this));
    this.connection.onCompletion(this.handleCompletion);
    this.connection.onFoldingRanges((params: FoldingRangeRequestParam) =>
      this.handleFoldingRanges(params, true, false)
    );
    this.connection.onNotification(
      LSPExtensionMethod.DID_UPDATE_COMPLETION_DATA,
      this.handleUpdateCompletionData
    );

    if (
      params.initializationOptions &&
      params.initializationOptions.grammar === 'w3'
    ) {
      this.parser = new W3SpecSparqlParser({
        config: { errorMessageProvider },
      });
    } else {
      this.parser = new StardogSparqlParser({
        config: { errorMessageProvider },
      });
    }

    return {
      capabilities: {
        // Tell the client that the server works in NONE text document sync mode
        textDocumentSync: this.documents.syncKind[0],
        completionProvider: {
          triggerCharacters: ['<', '?', '$'],
        },
        foldingRangeProvider: true,
        hoverProvider: true,
      },
    };
  }

  handleUpdateCompletionData(update: SparqlCompletionData) {
    // `relationshipCompletionItems` and `typeCompletionItems` must be updated
    // in 2 different scenarios:
    // #1 - namespaces provided after relationshipBindings or typeBindings
    // #2 - namespaces provided before relationshipBindings or typeBindings
    // Otherwise you can find yourself with 1, both or neither reflecting the
    // namespace prefixes based on the order the updates are processed, which is
    // indeterminate.
    if (update.namespaces) {
      this.namespaceMap = namespaceArrayToObj(update.namespaces);
    }
    if (
      update.relationshipBindings ||
      (update.namespaces && this.relationshipBindings)
    ) {
      this.relationshipBindings =
        update.relationshipBindings || this.relationshipBindings;
      this.relationshipCompletionItems = this.buildCompletionItemsFromData(
        this.namespaceMap,
        this.relationshipBindings
          .map((binding) => ({
            iri: binding && binding.relationship && binding.relationship.value,
            count:
              binding && binding.count && binding.count.value !== undefined
                ? binding.count.value
                : undefined,
          }))
          .filter(({ iri, count }) => iri !== undefined && count !== undefined)
      );
    }
    if (update.typeBindings || (update.namespaces && this.typeBindings)) {
      this.typeBindings = update.typeBindings || this.typeBindings;
      this.typeCompletionItems = this.buildCompletionItemsFromData(
        this.namespaceMap,
        this.typeBindings
          .map((binding) => ({
            iri: binding && binding.type && binding.type.value,
            count:
              binding && binding.count && binding.count.value !== undefined
                ? binding.count.value
                : undefined,
          }))
          .filter(({ iri, count }) => iri !== undefined && count !== undefined)
      );
    }
  }

  buildCompletionItemsFromData(
    namespaceMap,
    irisAndCounts: { iri: string; count: string }[]
  ): CompletionItem[] {
    const prefixed: CompletionItem[] = [];
    const full: CompletionItem[] = irisAndCounts.map(({ iri, count }) => {
      let prefixedIri;
      const alphaSortTextForCount =
        ARBITRARILY_LARGE_NUMBER - parseInt(count, 10);
      if (namespaceMap) {
        prefixedIri = abbreviatePrefixObj(iri, namespaceMap);
      }
      if (prefixedIri !== iri) {
        prefixed.push({
          ...makeCompletionItemFromPrefixedNameAndNamespaceIri(
            prefixedIri,
            iri
          ),
          // here we take the difference of an arbitrarily large number and the iri's count which allows us to invert the
          // sort order of the items to be highest count number first. "00" is appended to ensure precedence over full iri,
          // suggestions
          sortText: `00${alphaSortTextForCount}${prefixedIri}`,
          detail: `${count} occurrences`,
        });
      }
      return {
        label: `<${iri}>`,
        kind: CompletionItemKind.EnumMember,
        sortText: `01${alphaSortTextForCount}${iri}`,
        detail: `${count} occurrences`,
      };
    });
    const fullList = full.concat(prefixed);
    return fullList;
  }

  replaceTokenAtCursor({
    document,
    replacement,
    replacementRange,
    tokenAtCursor,
  }: {
    document: TextDocument;
    replacement: string;
    replacementRange?: CompletionCandidate['replacementRange'];
    tokenAtCursor: IToken;
  }): TextEdit {
    let textEditRange: Range;

    if (replacementRange) {
      textEditRange = {
        start: document.positionAt(replacementRange.start),
        end: document.positionAt(replacementRange.end),
      };
    } else {
      textEditRange = {
        start: document.positionAt(tokenAtCursor.startOffset),
        end: document.positionAt(tokenAtCursor.endOffset + 1),
      };
    }

    return TextEdit.replace(textEditRange, replacement);
  }

  getRelationshipCompletions(document: TextDocument, tokenAtCursor: IToken) {
    return [
      ...this.relationshipCompletionItems.map((item) => ({
        ...item,
        textEdit: this.replaceTokenAtCursor({
          document,
          tokenAtCursor,
          replacement: item.label,
        }),
      })),
      ...getCommonCompletionItemsGivenNamespaces(
        this.namespaceMap || {}
      ).properties.map((item) => ({
        ...item,
        textEdit: this.replaceTokenAtCursor({
          document,
          tokenAtCursor,
          replacement: item.label,
        }),
      })),
    ];
  }

  getClassCompletions(document: TextDocument, tokenAtCursor: IToken) {
    return [
      ...this.typeCompletionItems.map((item) => ({
        ...item,
        textEdit: this.replaceTokenAtCursor({
          document,
          tokenAtCursor,
          replacement: item.label,
        }),
      })),
      ...getCommonCompletionItemsGivenNamespaces(
        this.namespaceMap || {}
      ).classes.map((item) => ({
        ...item,
        textEdit: this.replaceTokenAtCursor({
          document,
          tokenAtCursor,
          replacement: item.label,
        }),
      })),
    ];
  }

  handleCompletion(params: TextDocumentPositionParams): CompletionItem[] {
    const { uri } = params.textDocument;
    const document = this.documents.get(uri);
    let { tokens } = this.parseStateManager.getParseStateForUri(uri);

    if (!tokens) {
      const { tokens: newTokens, cst } = this.parseDocument(document);
      tokens = newTokens;
      this.parseStateManager.saveParseStateForUri(uri, { cst, tokens });
    }

    const tokenIdxAtCursor = tokens.findIndex(
      (tkn) =>
        tkn.startOffset <= document.offsetAt(params.position) &&
        tkn.endOffset + 1 >= document.offsetAt(params.position)
    );

    if (tokenIdxAtCursor < 0) {
      return;
    }

    const tokenAtCursor = tokens[tokenIdxAtCursor];
    const tokensUpToCursor = tokens.slice(0, tokenIdxAtCursor);
    const tokensAfterCursor = tokens.slice(tokenIdxAtCursor + 1);
    const tokenBeforeCursor = tokens[tokenIdxAtCursor - 1];
    const tokensBeforeAndAfterCursor = [
      ...tokensUpToCursor,
      ...tokensAfterCursor,
    ];
    const { vars, prefixes, localNames, iris } = getUniqueIdentifiers(
      tokensBeforeAndAfterCursor
    );
    const candidates: CompletionCandidate[] = this.parser.computeContentAssist(
      'SparqlDoc',
      tokensUpToCursor
    );

    const variableCompletions: CompletionItem[] = vars.map((variable) => {
      return {
        label: variable,
        kind: CompletionItemKind.Variable,
        sortText: candidates.some((tkn) => isVar(tkn.nextTokenType.tokenName))
          ? `1${variable}` // number prefix used to force ordering of suggestions to user
          : null,
        textEdit: this.replaceTokenAtCursor({
          document,
          tokenAtCursor,
          replacement: variable,
        }),
      };
    });

    if (this.namespaceMap) {
      prefixes.push(...Object.keys(this.namespaceMap));
    }

    const prefixCompletions: CompletionItem[] = prefixes.map((prefix) => {
      const label = prefix.replace(/:$/, '');
      return {
        label,
        kind: CompletionItemKind.EnumMember,
        sortText: candidates.some((tkn) =>
          isPrefix(tkn.nextTokenType.tokenName)
        )
          ? `2${label}` // number prefix used to force ordering of suggestions to user
          : null,
        textEdit: this.replaceTokenAtCursor({
          document,
          tokenAtCursor,
          replacement: prefix,
        }),
      };
    });

    const localCompletions: CompletionItem[] = localNames.map((local) => {
      const humanName = this.bfoMappings[local] || '';
      let newLabel = '';
      if (humanName !== '') {
        newLabel = `${local} (${humanName})`;
      } else {
        newLabel = local;
      }

      return {
        label: newLabel,
        kind: CompletionItemKind.EnumMember,
        sortText: candidates.some((tkn) =>
          isLocalName(tkn.nextTokenType.tokenName)
        )
          ? `2${local}` // number prefix used to force ordering of suggestions to user
          : null,
        textEdit: this.replaceTokenAtCursor({
          document,
          tokenAtCursor,
          replacement: local,
        }),
      };
    });

    const iriCompletions: CompletionItem[] = iris.map((iri) => ({
      label: iri,
      kind: CompletionItemKind.EnumMember,
      sortText: candidates.some((tkn) => isIriRef(tkn.nextTokenType.tokenName))
        ? `2${iri}` // number prefix used to force ordering of suggestions to user
        : null,
      textEdit: this.replaceTokenAtCursor({
        document,
        tokenAtCursor,
        replacement: iri,
      }),
    }));

    // Unlike the previous completion types, sparqlKeywords only appear in dropdown if they're valid
    const keywordCompletions = uniqBy(
      candidates.filter(
        (item) =>
          item.nextTokenType.tokenName !== tokenAtCursor.image &&
          item.nextTokenType.tokenName in sparqlKeywords
      ),
      (completionCandidate: CompletionCandidate) =>
        regexPatternToString(completionCandidate.nextTokenType.PATTERN)
    ).map((completionCandidate: CompletionCandidate) => {
      const keywordString = regexPatternToString(
        completionCandidate.nextTokenType.PATTERN
      );
      return {
        label: keywordString,
        kind: CompletionItemKind.Keyword,
        textEdit: this.replaceTokenAtCursor({
          document,
          tokenAtCursor,
          replacement: keywordString,
          replacementRange: completionCandidate.replacementRange,
        }),
      };
    });

    const finalCompletions = [
      ...variableCompletions,
      ...prefixCompletions,
      ...localCompletions,
      ...iriCompletions,
      ...keywordCompletions,
    ];

    const shouldIncludeTypes =
      tokenBeforeCursor && tokenBeforeCursor.tokenType.tokenName === 'A';

    // Each "candidate" is essentially a tokenType that would be valid as the next entry
    // in the query. Also contained on the candidate is a "rule stack": an array
    // of the grammar rules in the parser's stack leading to the expectation of the "candidate"
    // tokenType. For each candidate, we want to check its ruleStack for whether it contains
    // any of the rules that signify "edges" in a graph.
    //
    // N.B. In the SPARQL grammar, this happens to be any rule that contains the token 'a'.
    const shouldIncludeRelationships = candidates.some((candidate) => {
      return candidate.ruleStack.some((rule) => {
        return ['Verb', 'PathPrimary', 'PathOneInPropertySet'].some(
          (verbRule) => rule === verbRule
        );
      });
    });

    if (shouldIncludeRelationships) {
      finalCompletions.push(
        ...this.getRelationshipCompletions(document, tokenAtCursor)
      );
    }

    if (shouldIncludeTypes) {
      finalCompletions.push(
        ...this.getClassCompletions(document, tokenAtCursor)
      );
    }

    return finalCompletions;
  }

  handleHover(params: TextDocumentPositionParams): Hover {
    const { uri } = params.textDocument;
    const document = this.documents.get(uri);
    const content = document.getText();
    let { cst } = this.parseStateManager.getParseStateForUri(uri);

    if (!cst) {
      const { cst: newCst } = this.parseDocument(document);
      cst = newCst;
      this.parseStateManager.saveParseStateForUri(uri, { cst });
    }

    const offsetAtPosition = document.offsetAt(params.position);
    const currentRuleTokens: IToken[] = [];
    let cursorTkn: IToken;
    let currentRule: string;

    const tokenCollector = (ctx, next) => {
      if (isCstNode(ctx.node)) {
        return next();
      }
      currentRuleTokens.push(ctx.node);
    };

    const findCurrentRule = (ctx, next) => {
      const { node, parentCtx } = ctx;
      if (isCstNode(node)) {
        return next();
      }
      // must be a token
      if (
        parentCtx.node &&
        offsetAtPosition >= node.startOffset &&
        offsetAtPosition <= node.endOffset
      ) {
        // found token that user's cursor is hovering over
        cursorTkn = node;
        currentRule = parentCtx.node.name;

        traverse(parentCtx.node, tokenCollector);
      }
    };

    traverse(cst, findCurrentRule);

    // get first and last tokens' positions
    const currentRuleRange = currentRuleTokens.reduce(
      (memo, token) => {
        if (token.endOffset > memo.endOffset) {
          memo.endOffset = token.endOffset;
        }
        if (token.startOffset < memo.startOffset) {
          memo.startOffset = token.startOffset;
        }
        return memo;
      },
      {
        startOffset: content.length,
        endOffset: 0,
      }
    );

    if (!cursorTkn) {
      return {
        contents: [],
      };
    }

    // Look up the BFO_ mapping for the current token.
    const humanName = this.bfoMappings[cursorTkn.image] || '';

    if (humanName !== '') {
      return {
        contents: `\`\`\`
${currentRule} : '${humanName}'
  \`\`\``,
        range: {
          start: document.positionAt(currentRuleRange.startOffset),
          end: document.positionAt(currentRuleRange.endOffset + 1),
        },
      };
    } else {
      return {
        contents: `\`\`\`
${currentRule}
  \`\`\``,
        range: {
          start: document.positionAt(currentRuleRange.startOffset),
          end: document.positionAt(currentRuleRange.endOffset + 1),
        },
      };
    }
  }

  onContentChange(
    { document }: TextDocumentChangeEvent,
    parseResult: ReturnType<
      AbstractLanguageServer<
        StardogSparqlParser | W3SpecSparqlParser
      >['parseDocument']
    >
  ) {
    const { uri } = document;
    const content = document.getText();

    if (!content.length) {
      this.connection.sendDiagnostics({
        uri,
        diagnostics: [],
      });
      return;
    }

    const { errors } = parseResult;
    const diagnostics = this.getParseDiagnostics(document, errors);

    this.connection.sendDiagnostics({
      uri,
      diagnostics,
    });
  }
}
